import { useCallback, useEffect, useState } from 'react';
import { Card, Upload, Button, Select, Tag, Space, App, Popconfirm, Modal, Input } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import {
  CheckOutlined, CloseOutlined, DeleteOutlined, EyeOutlined, FileProtectOutlined,
  InboxOutlined, UploadOutlined,
} from '@ant-design/icons';
import {
  deleteOrderAttachment,
  listOrderAttachments,
  receiveOrderAttachment,
  reviewOrderAttachment,
  stampOrderAttachment,
  uploadMaterialAttachment,
  type AttachmentStatus,
  type OrderAttachmentItem,
} from '@/services/attachments';

const MATERIAL_TYPES = [
  '身份证复印件', '离职申请书', '离职交接单', '离职证明', '劳动合同', '社保缴费记录', '其他材料',
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  uploaded: { label: '已上传', color: 'default' },
  rejected: { label: '已退回', color: 'red' },
  approved: { label: '已审核', color: 'green' },
  stamped: { label: '已用印', color: 'purple' },
  received: { label: '已收齐', color: 'blue' },
};

interface MaterialsUploadProps {
  workOrderId: string;
  bizPurpose: 'benefit_material' | 'resignation_cert' | 'resignation_material' | 'renewal_contract';
}

const MaterialsUpload: React.FC<MaterialsUploadProps> = ({ workOrderId, bizPurpose }) => {
  const { message } = App.useApp();
  const [attachments, setAttachments] = useState<OrderAttachmentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [materialType, setMaterialType] = useState('其他材料');
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [stampModalOpen, setStampModalOpen] = useState(false);
  const [stampTarget, setStampTarget] = useState<OrderAttachmentItem | null>(null);
  const [stampNo, setStampNo] = useState('');

  const title = bizPurpose === 'benefit_material' ? '申报材料' : '离职材料收集';

  const fetchAttachments = useCallback(async () => {
    if (!workOrderId) return;
    setLoading(true);
    try {
      const list = await listOrderAttachments({ work_order_id: workOrderId, biz_purpose: bizPurpose });
      setAttachments(list);
    } catch {
      message.error('加载附件失败');
    } finally {
      setLoading(false);
    }
  }, [bizPurpose, message, workOrderId]);

  useEffect(() => {
    void fetchAttachments();
  }, [fetchAttachments]);

  const handleUpload = async () => {
    const file = fileList[0]?.originFileObj as File | undefined;
    if (!file) {
      message.warning('请先选择文件');
      return;
    }
    setUploading(true);
    try {
      const item = await uploadMaterialAttachment(file, {
        work_order_id: workOrderId,
        biz_purpose: bizPurpose,
        material_type: materialType,
      });
      setAttachments((prev) => [item, ...prev.filter((old) => old.id !== item.id)]);
      setFileList([]);
      message.success('上传成功');
    } catch {
      message.error('上传失败');
    } finally {
      setUploading(false);
    }
  };

  const replaceAttachment = (next: OrderAttachmentItem) => {
    setAttachments((prev) => prev.map((item) => (item.id === next.id ? next : item)));
  };

  const handleStatusChange = async (item: OrderAttachmentItem, newStatus: AttachmentStatus) => {
    try {
      if (newStatus === 'approved' || newStatus === 'rejected') {
        replaceAttachment(await reviewOrderAttachment(item.id, newStatus));
      } else if (newStatus === 'received') {
        replaceAttachment(await receiveOrderAttachment(item.id));
      }
      message.success('状态已更新');
    } catch {
      message.error('状态更新失败');
    }
  };

  const handleStamp = async () => {
    if (!stampTarget) return;
    if (!stampNo.trim()) {
      message.warning('请输入用印单号');
      return;
    }
    try {
      replaceAttachment(await stampOrderAttachment(stampTarget.id, stampNo.trim()));
      setStampModalOpen(false);
      setStampTarget(null);
      setStampNo('');
      message.success('用印信息已记录');
    } catch {
      message.error('用印信息保存失败');
    }
  };

  const handleDelete = async (item: OrderAttachmentItem) => {
    try {
      await deleteOrderAttachment(item.id);
      setAttachments((prev) => prev.filter((a) => a.id !== item.id));
      message.success('附件已删除');
    } catch {
      message.error('附件删除失败');
    }
  };

  const getMaterialType = (item: OrderAttachmentItem) => String(item.metadata?.material_type || item.metadata?.materialType || '其他材料');

  return (
    <Card title={title} loading={loading}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space wrap>
          <Select
            value={materialType}
            onChange={setMaterialType}
            style={{ width: 180 }}
            options={MATERIAL_TYPES.map((type) => ({ label: type, value: type }))}
          />
          <Upload
            beforeUpload={(file) => {
              setFileList([{ uid: file.uid, name: file.name, status: 'done', originFileObj: file }]);
              return false;
            }}
            onRemove={() => setFileList([])}
            fileList={fileList}
            maxCount={1}
          >
            <Button icon={<UploadOutlined />}>选择文件</Button>
          </Upload>
          {fileList.length > 0 && (
            <Space>
              <Button type="primary" size="small" onClick={handleUpload} loading={uploading}>确认上传</Button>
              <Button size="small" onClick={() => setFileList([])} disabled={uploading}>取消</Button>
            </Space>
          )}
        </Space>

        <div>
          {attachments.map((item) => {
            const statusInfo = STATUS_LABELS[item.status] || { label: item.status, color: 'default' };
            return (
              <Card key={item.id} size="small" style={{ marginBottom: 8 }} styles={{ body: { padding: '8px 12px' } }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <Space>
                    <InboxOutlined />
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{item.original_name || item.file_name}</div>
                      <Space size={4} style={{ fontSize: 11, color: '#999' }} wrap>
                        <Tag>{getMaterialType(item)}</Tag>
                        <Tag color={statusInfo.color}>{statusInfo.label}</Tag>
                        <span>{(Number(item.file_size || 0) / 1024).toFixed(1)} KB</span>
                        <span>{item.created_at ? new Date(item.created_at).toLocaleDateString('zh-CN') : '-'}</span>
                        {item.reject_reason && <Tag color="red">退回：{item.reject_reason}</Tag>}
                      </Space>
                    </div>
                  </Space>
                  <Space size={4} wrap>
                    {item.status === 'uploaded' && (
                      <>
                        <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => handleStatusChange(item, 'approved')}>
                          审核通过
                        </Button>
                        <Popconfirm title="退回此材料？" onConfirm={() => handleStatusChange(item, 'rejected')}>
                          <Button type="link" size="small" danger icon={<CloseOutlined />}>退回</Button>
                        </Popconfirm>
                      </>
                    )}
                    {item.status === 'approved' && (
                      <Button type="link" size="small" icon={<FileProtectOutlined />} onClick={() => { setStampTarget(item); setStampNo(''); setStampModalOpen(true); }}>
                        申请用印
                      </Button>
                    )}
                    {item.status === 'stamped' && (
                      <>
                        <Tag color="purple">用印单号: {item.stamp_no}</Tag>
                        <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => handleStatusChange(item, 'received')}>
                          确认收齐
                        </Button>
                      </>
                    )}
                    <Button type="link" size="small" icon={<EyeOutlined />} disabled={!item.download_url} onClick={() => item.download_url && window.open(item.download_url, '_blank')}>
                      预览
                    </Button>
                    <Popconfirm title="确定删除此附件？" onConfirm={() => handleDelete(item)}>
                      <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                </div>
              </Card>
            );
          })}
          {attachments.length === 0 && (
            <div style={{ textAlign: 'center', color: '#999', padding: 24 }}>
              <InboxOutlined style={{ fontSize: 32 }} />
              <div>暂无材料</div>
            </div>
          )}
        </div>
      </Space>

      <Modal
        title="用印申请"
        open={stampModalOpen}
        onOk={handleStamp}
        onCancel={() => { setStampModalOpen(false); setStampTarget(null); }}
      >
        <div style={{ marginBottom: 12 }}>
          材料: <Tag>{stampTarget ? getMaterialType(stampTarget) : ''}</Tag> {stampTarget?.original_name || stampTarget?.file_name}
        </div>
        <Input placeholder="请输入用印单号" value={stampNo} onChange={(event) => setStampNo(event.target.value)} />
      </Modal>
    </Card>
  );
};

export default MaterialsUpload;
