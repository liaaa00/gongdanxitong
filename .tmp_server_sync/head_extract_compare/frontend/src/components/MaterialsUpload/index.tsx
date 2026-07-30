import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { Card, Upload, Button, Tag, Space, App, Popconfirm } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import {
  CheckOutlined, CloseOutlined, DeleteOutlined, DownloadOutlined,
  InboxOutlined, UploadOutlined,
} from '@ant-design/icons';
import {
  deleteOrderAttachment,
  downloadOrderAttachment,
  listOrderAttachments,
  receiveOrderAttachment,
  reviewOrderAttachment,
  uploadMaterialAttachment,
  type AttachmentStatus,
  type OrderAttachmentItem,
} from '@/services/attachments';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  uploaded: { label: '已上传', color: 'default' },
  rejected: { label: '已退回', color: 'red' },
  approved: { label: '已审核', color: 'green' },
  received: { label: '已收齐', color: 'blue' },
};

interface MaterialsUploadProps {
  workOrderId: string;
  bizPurpose: 'benefit_material' | 'resignation_cert' | 'resignation_material' | 'renewal_contract';
}

// 提交前暂存能力：workOrderId 为空时选中的文件先本地缓存，
// 父组件在工单创建成功后通过 ref 调用 uploadStaged 一次性上传。
export interface MaterialsUploadHandle {
  uploadStaged: (workOrderId: string) => Promise<void>;
  hasStaged: () => boolean;
}

interface StagedFile {
  uid: string;
  file: File;
}

// 附件格式白名单：图片、Word、PDF（与后端 20MB 上限、黑名单兜底一致，前端做正向拦截）。
const ALLOWED_UPLOAD_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'doc', 'docx', 'pdf'];
const UPLOAD_ACCEPT = 'image/*,.pdf,.doc,.docx';

function isAllowedUploadFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return ALLOWED_UPLOAD_EXTENSIONS.includes(ext);
}

const MaterialsUpload = forwardRef<MaterialsUploadHandle, MaterialsUploadProps>(({ workOrderId, bizPurpose }, ref) => {
  const { message } = App.useApp();
  const [attachments, setAttachments] = useState<OrderAttachmentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);

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
    if (!workOrderId) {
      setStagedFiles((prev) => [...prev, { uid: `staged-${Date.now()}-${file.name}`, file }]);
      setFileList([]);
      message.success('已加入待上传列表，提交工单后自动上传');
      return;
    }
    setUploading(true);
    try {
      const item = await uploadMaterialAttachment(file, {
        work_order_id: workOrderId,
        biz_purpose: bizPurpose,
        status: 'received',
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


  const handleDelete = async (item: OrderAttachmentItem) => {
    try {
      await deleteOrderAttachment(item.id);
      setAttachments((prev) => prev.filter((a) => a.id !== item.id));
      message.success('附件已删除');
    } catch {
      message.error('附件删除失败');
    }
  };

  const handleDownload = async (item: OrderAttachmentItem) => {
    try {
      await downloadOrderAttachment(item);
    } catch {
      message.error('文件下载失败');
    }
  };

  const removeStaged = (uid: string) => {
    setStagedFiles((prev) => prev.filter((item) => item.uid !== uid));
  };

  const uploadStaged = useCallback(async (targetWorkOrderId: string) => {
    if (!targetWorkOrderId || stagedFiles.length === 0) return;
    for (const staged of stagedFiles) {
      await uploadMaterialAttachment(staged.file, {
        work_order_id: targetWorkOrderId,
        biz_purpose: bizPurpose,
        status: 'received',
      });
    }
    setStagedFiles([]);
  }, [bizPurpose, stagedFiles]);

  useImperativeHandle(ref, () => ({
    uploadStaged,
    hasStaged: () => stagedFiles.length > 0,
  }), [uploadStaged, stagedFiles.length]);

  return (
    <Card title={title} loading={loading}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space wrap>
          <Upload
            accept={UPLOAD_ACCEPT}
            beforeUpload={(file) => {
              if (!isAllowedUploadFile(file.name)) {
                message.error('仅支持图片、Word、PDF 格式');
                return Upload.LIST_IGNORE;
              }
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
          {stagedFiles.map((staged) => (
            <Card key={staged.uid} size="small" style={{ marginBottom: 8 }} styles={{ body: { padding: '8px 12px' } }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <Space>
                  <InboxOutlined />
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{staged.file.name}</div>
                    <Space size={4} style={{ fontSize: 11, color: '#999' }} wrap>
                      <Tag color="orange">待上传</Tag>
                      <span>{(staged.file.size / 1024).toFixed(1)} KB</span>
                    </Space>
                  </div>
                </Space>
                <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => removeStaged(staged.uid)} />
              </div>
            </Card>
          ))}
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
                        <Tag color={statusInfo.color}>{statusInfo.label}</Tag>
                        <span>{(Number(item.file_size || 0) / 1024).toFixed(1)} KB</span>
                        <span>{item.created_at ? new Date(item.created_at).toLocaleDateString('zh-CN') : '-'}</span>
                        {item.reject_reason && <Tag color="red">退回：{item.reject_reason}</Tag>}
                      </Space>
                    </div>
                  </Space>
                  <Space size={4} wrap>
                    <Button type="link" size="small" icon={<DownloadOutlined />} disabled={!item.download_url} onClick={() => handleDownload(item)}>
                      下载
                    </Button>
                    <Popconfirm title="确定删除此附件？" onConfirm={() => handleDelete(item)}>
                      <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                </div>
              </Card>
            );
          })}
          {attachments.length === 0 && stagedFiles.length === 0 && (
            <div style={{ textAlign: 'center', color: '#999', padding: 24 }}>
              <InboxOutlined style={{ fontSize: 32 }} />
              <div>暂无材料</div>
            </div>
          )}
        </div>
      </Space>
    </Card>
  );
});

MaterialsUpload.displayName = 'MaterialsUpload';

export default MaterialsUpload;
