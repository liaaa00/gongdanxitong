import { Navigate, useParams } from 'react-router-dom';

const ResignationDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/work-orders/${id}` : '/work-orders?orderType=resignation'} replace />;
};

export default ResignationDetail;
