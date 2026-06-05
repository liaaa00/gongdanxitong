import { Navigate, useParams } from 'react-router-dom';

const ResignationCert: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/work-orders/${id}?focus=materials` : '/work-orders?orderType=resignation'} replace />;
};

export default ResignationCert;
