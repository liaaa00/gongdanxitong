import { useState } from 'react';
import type { FormInstance } from 'antd';
import { Alert, Col, Form, Input, Row, Select, Upload, Button, App } from 'antd';
import type { UploadFile, UploadProps } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { getCustomers, type CustomerItem } from '@/services/customers';
import { getDepartments, type DepartmentItem } from '@/services/departments';
import { uploadAttachment } from '@/services/upload';
import {
  OUT_OF_PROVINCE_ORDER_TYPE_OPTIONS,
  PROVINCES_27,
  type OutOfProvinceOrderType,
} from '@/constants/outOfProvince';

// TODO: 等业务提供菜鸟模板字段清单后补充完整员工信息字段
export interface OutOfProvinceOrderFormValues {
  orderType: OutOfProvinceOrderType;
  customerId?: string;
  departmentId?: string;
  province: string;
  employeeName?: string;
  employeeIdCard?: string;
  // TODO: 增减员表单其他字段待业务提供模板补充
  attachments?: string[];
  extraData?: Record<string, unknown>;
}

interface OutOfProvinceOrderFormProps {
  form: FormInstance<OutOfProvinceOrderFormValues>;
  initialValues?: Partial<OutOfProvinceOrderFormValues>;
  readOnly?: boolean;
}

interface AttachmentFieldProps {
  value?: string[];
  onChange?: (value: string[]) => void;
  disabled?: boolean;
}

const formCol = { xs: 24, md: 12 };

function AttachmentField({ value = [], onChange, disabled }: AttachmentFieldProps) {
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);
  const fileList: UploadFile[] = value.map((id, index) => ({
    uid: id,
    name: '附件' + (index + 1),
    status: 'done',
    response: { id },
  }));

  const customRequest: UploadProps['customRequest'] = async ({ file, onError, onSuccess }) => {
    if (value.length >= 5) {
      message.warning('最多上传 5 个附件');
      onError?.(new Error('最多上传 5 个附件'));
      return;
    }
    setUploading(true);
    try {
      const result = await uploadAttachment(file as File);
      const id = String(result.fileId || result.id || result.url || result.downloadUrl || '');
      if (!id) throw new Error('附件上传未返回文件标识');
      onChange?.([...value, id]);
      onSuccess?.({ id });
      message.success('附件上传成功');
    } catch (error) {
      onError?.(error as Error);
      message.error(error instanceof Error ? error.message : '附件上传失败');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Upload
      fileList={fileList}
      customRequest={customRequest}
      disabled={disabled}
      maxCount={5}
      multiple
      onRemove={(file) => {
        onChange?.(value.filter((id) => id !== file.uid));
        return true;
      }}
      showUploadList={{ showRemoveIcon: !disabled, showDownloadIcon: false }}
    >
      {!disabled && value.length < 5 ? (
        <Button icon={<UploadOutlined />} loading={uploading}>上传附件</Button>
      ) : null}
    </Upload>
  );
}

export default function OutOfProvinceOrderForm({
  form,
  initialValues,
  readOnly = false,
}: OutOfProvinceOrderFormProps) {
  const { message } = App.useApp();
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);

  // ponytail: 客户/部门下拉数据加载逻辑参考InServiceOrderForm保持一致
  const loadCustomers = async () => {
    try {
      const result = await getCustomers({ page: 1, pageSize: 100 });
      setCustomers(result.list.filter((item) => item.is_active !== false));
    } catch {
      message.error('加载客户列表失败');
    }
  };

  const loadDepartments = async () => {
    try {
      const data = await getDepartments();
      setDepartments(data.filter((item) => item.is_active !== false));
    } catch {
      message.error('加载部门列表失败');
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={initialValues}
      disabled={readOnly}
      onFinish={() => {}}
    >
      <Alert
        type="warning"
        showIcon
        message="TODO：增减员表单字段待业务提供菜鸟模板清单后补充完善"
        style={{ marginBottom: 16 }}
      />
      <Row gutter={16}>
        <Col {...formCol}>
          <Form.Item
            name="orderType"
            label="增减员类型"
            rules={[{ required: true, message: '请选择增减员类型' }]}
          >
            <Select options={[...OUT_OF_PROVINCE_ORDER_TYPE_OPTIONS]} placeholder="请选择" />
          </Form.Item>
        </Col>
        <Col {...formCol}>
          <Form.Item
            name="province"
            label="省份"
            rules={[{ required: true, message: '请选择省份' }]}
          >
            <Select
              showSearch
              placeholder="请选择省份"
              options={PROVINCES_27.map((p) => ({ label: p, value: p }))}
            />
          </Form.Item>
        </Col>
        <Col {...formCol}>
          <Form.Item
            name="customerId"
            label="客户名称"
            rules={[{ required: true, message: '请选择客户' }]}
          >
            <Select
              showSearch
              placeholder="请选择客户"
              options={customers.map((c) => ({
                label: [c.customer_code, c.customer_name].filter(Boolean).join(' - '),
                value: c.id,
              }))}
              onFocus={loadCustomers}
              onChange={(val) => {
                form.setFieldValue('departmentId', undefined);
                if (val) void loadDepartments();
              }}
            />
          </Form.Item>
        </Col>
        <Col {...formCol}>
          <Form.Item name="departmentId" label="部门">
            <Select
              showSearch
              placeholder="请选择部门"
              options={departments.map((d) => ({ label: d.name, value: d.id }))}
            />
          </Form.Item>
        </Col>
        {/* TODO: 员工信息字段待菜鸟模板补充 */}
        <Col {...formCol}>
          <Form.Item name="employeeName" label="员工姓名（待模板补充字段）">
            <Input placeholder="TODO" />
          </Form.Item>
        </Col>
        <Col {...formCol}>
          <Form.Item name="employeeIdCard" label="身份证号（待模板补充字段）">
            <Input placeholder="TODO" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item name="attachments" label="附件">
            <AttachmentField />
          </Form.Item>
        </Col>
      </Row>
    </Form>
  );
}
