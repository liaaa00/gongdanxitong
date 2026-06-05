import { Navigate } from 'react-router-dom';

const ResignationNew: React.FC = () => <Navigate to="/work-orders/new?orderType=resignation" replace />;

export default ResignationNew;
