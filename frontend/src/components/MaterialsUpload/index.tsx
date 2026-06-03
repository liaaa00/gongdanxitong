import { useState, useEffect, useCallback } from 'react';
import { Card, Upload, Button, Select, Tag, Space, App, Popconfirm, Modal, Input } from 'antd';
import {
  UploadOutlined, InboxOutlined, CheckOutlined, CloseOutlined,
  FileProtectOutlined, EyeOutlined, DeleteOutlined,
} from '@ant-design/icons';
import type { UploadFile } from 'antd';

interface AttachmentItem {
  id: string;
  material_type: string;
  file_name: string;
  file_path: string;
  file_size: number;
  status: 'uploaded' | 'rejected' | 'approved' | 'stamped' | 'received';
  reject_reason?: string;
  stamp_no?: string;
  uploaded_at: string;
}

const MATERIAL_TYPES = [
  '身份证复印件', '银行卡复印件', '工伤认定书', '医疗记录', '费用清单',
  '诊断证明', '离职证明', '劳动合同', '社保缴费记录', '其他材料',
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  uploaded: { label: '已上传', color: 'default' },
  approved: { label: '已审核', color: 'success' },
  rejected: { label: '已退回', color: 'error' },
  stamped: { label: '已用印', color: 'purple' },
  received: { label: '已收齐', color: 'cyan' },
};

interface MaterialsUploadProps {
  workOrderId: string;
  bizPurpose: 'benefit_material' | 'resignation_cert' | 'renewal_contract';
}

const MaterialsUpload: React.FC<MaterialsUploadProps> = ({ workOrderId, bizPurpose }) => {
  const { message } = App.useApp();
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [stampModalOpen, setStampModalOpen] = useState(false);
  const [stampTarget, setStampTarget] = useState<AttachmentItem | null>(null);
  const [stampNo, setStampNo] = useState('');

  const fetchAttachments = useCallback(async () => {
    setLoading(true);
    try {
      const mockAttachments: AttachmentItem[] = [
        { id: 'att-1', material_type: '身份证复印件', file_name: 'id_card.pdf', file_path: '/uploads/id_card.pdf', file_size: 102400, status: 'approved', uploaded_at: new Date().toISOString() },
        { id: 'att-2', material_type: '工伤认定书', file_name: 'injury_report.pdf', file_path: '/uploads/injury.pdf', file_size: 204800, status: 'uploaded', uploaded_at: new Date(Date.now() - 86400000).toISOString() },
      ];
      setAttachments(mockAttachments);
    } catch {
      message.error('加载附件失败');
    } finally {
      setLoading(false);
    }
  }, [workOrderId]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const handleUpload = () => {
    message.success('文件上传成功');
    setFileList([]);
    fetchAttachments();
  };

  const handleStatusChange = (item: AttachmentItem, newStatus: string) => {
    setAttachments((prev) =>
      prev.map((a) => (a.id === item.id ? { ...a, status: newStatus as AttachmentItem['status'] } : a)),
    );
    const s = STATUS_LABELS[newStatus];
    message.success('已更新为' + (s?.label || newStatus));
  };

  const handleStamp = () => {
    if (!stampTarget || !stampNo.trim()) return;
    setAttachments((prev) =>
      prev.map((a) => (a.id === stampTarget.id ? { ...a, status: 'stamped', stamp_no: stampNo } : a)),
    );
    message.success('用印完成');
    setStampModalOpen(false);
    setStampNo('');
    setStampTarget(null);
  };

  return (
    <Card title={bizPurpose === 'resignation_cert' ? '离职材料收集' : '申报材料'} loading={loading}>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Upload
          multiple
          fileList={fileList}
          onChange={({ fileList: fl }) => setFileList(fl)}
          beforeUpload={() => false}
        >
          <Button icon={<UploadOutlined />}>选择文件上传</Button>
        </Upload>
        {fileList.length > 0 && (
          <Space>
            <Button type="primary" size="small" onClick={handleUpload}>确认上传</Button>
            <Button size="small" onClick={() => setFileList([])}>取消</Button>
          </Space>
        )}

        <div>
          {attachments.map((item) => {
            const statusInfo = STATUS_LABELS[item.status] || { label: item.status, color: 'default' };
            return (
              <Card key={item.id} size="small" style={{ marginBottom: 8 }}
                bodyStyle={{ padding: '8px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space>
                    <InboxOutlined />
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{item.file_name}</div>
                      <Space size={4} style={{ fontSize: 11, color: '#999' }}>
                        <Tag>{item.material_type}</Tag>
                        <Tag color={statusInfo.color}>{statusInfo.label}</Tag>
                        <span>{(item.file_size / 1024).toFixed(1)} KB</span>
                        <span>{new Date(item.uploaded_at).toLocaleDateString('zh-CN')}</span>
                      </Space>
                    </div>
                  </Space>
                  <Space size={4}>
                    {item.status === 'uploaded' && (
                      <>
                        <Button type="link" size="small" icon={<CheckOutlined />}
                          onClick={() => handleStatusChange(item, 'approved')}>审核通过</Button>
                        <Popconfirm title="退回此材料？" onConfirm={() => handleStatusChange(item, 'rejected')}>
                          <Button type="link" size="small" danger icon={<CloseOutlined />}>退回</Button>
                        </Popconfirm>
                      </>
                    )}
                    {item.status === 'approved' && (
                      <Button type="link" size="small" icon={<FileProtectOutlined />}
                        onClick={() => { setStampTarget(item); setStampNo(''); setStampModalOpen(true); }}>申请用印</Button>
                    )}
                    {item.status === 'stamped' && (
                      <>
                        <Tag color="purple">用印单号: {item.stamp_no}</Tag>
                        <Button type="link" size="small" icon={<CheckOutlined />}
                          onClick={() => handleStatusChange(item, 'received')}>确认收齐</Button>
                      </>
                    )}
                    <Button type="link" size="small" icon={<EyeOutlined />}>预览</Button>
                    <Popconfirm title="确定删除？" onConfirm={() => {
                      setAttachments((prev) => prev.filter((a) => a.id !== item.id));
                      message.success('已删除');
                    }}>
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

      <Modal title="用印申请" open={stampModalOpen} onOk={handleStamp}
        onCancel={() => { setStampModalOpen(false); setStampTarget(null); }}>
        <div style={{ marginBottom: 12 }}>
          材料: <Tag>{stampTarget?.material_type}</Tag> {stampTarget?.file_name}
        </div>
        <Input placeholder="请输入用印单号" value={stampNo}
          onChange={(e) => setStampNo(e.target.value)} />
      </Modal>
    </Card>
  );
};

export default MaterialsUpload;
