import { Radio } from 'antd';
import { TableOutlined, AppstoreOutlined, BuildOutlined } from '@ant-design/icons';
import type { ViewMode } from './types';

interface ViewSwitcherProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const ViewSwitcher: React.FC<ViewSwitcherProps> = ({ value, onChange }) => {
  const handleChange = (mode: ViewMode) => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', mode);
    window.history.replaceState({}, '', url.toString());
    onChange(mode);
  };

  return (
    <Radio.Group value={value} onChange={(e) => handleChange(e.target.value)} size="small">
      <Radio.Button value="table">
        <TableOutlined /> 表格
      </Radio.Button>
      <Radio.Button value="kanban">
        <AppstoreOutlined /> 看板
      </Radio.Button>
      <Radio.Button value="grid">
        <BuildOutlined /> 网格
      </Radio.Button>
    </Radio.Group>
  );
};

export default ViewSwitcher;
