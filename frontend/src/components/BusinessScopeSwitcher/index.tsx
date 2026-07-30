import { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Segmented } from 'antd';
import type { SegmentedProps } from 'antd';

type BusinessScope = 'beilun' | 'out_of_province';

interface BusinessScopeSwitcherProps {
  style?: React.CSSProperties;
  className?: string;
}

// ponytail: 不引入businessScope到appStore，切换器只控制路由跳转，保持与现有页面风格一致
export default function BusinessScopeSwitcher({ style, className }: BusinessScopeSwitcherProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const currentScope: BusinessScope = useMemo(() => {
    if (location.pathname.startsWith('/out-of-province')) return 'out_of_province';
    return 'beilun';
  }, [location.pathname]);

  const options: SegmentedProps['options'] = [
    { label: '单项业务', value: 'beilun' },
    { label: '省外派单', value: 'out_of_province' },
  ];

  const handleChange = (value: BusinessScope) => {
    if (value === currentScope) return;
    // ponytail: 切换时跳转到对应模块的默认列表页
    if (value === 'out_of_province') {
      navigate('/out-of-province/orders');
    } else {
      navigate('/in-service/orders');
    }
  };

  return (
    <Segmented
      options={options}
      value={currentScope}
      onChange={handleChange as any}
      style={style}
      className={className}
    />
  );
}
