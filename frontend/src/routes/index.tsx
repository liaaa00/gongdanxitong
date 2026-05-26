import { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { useUserStore } from '@/stores/userStore';
import ErrorBoundary from '@/components/ErrorBoundary';
import { canAccessPath } from '@/config/routeVisibility';

const LoginPage = lazy(() => import('@/pages/Login'));
const ChangePasswordPage = lazy(() => import('@/pages/ChangePassword'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Forbidden = lazy(() => import('@/pages/403'));
const NotFound = lazy(() => import('@/pages/404'));
const BasicLayout = lazy(() => import('@/layouts/BasicLayout'));

const WorkOrders = lazy(() => import('@/pages/WorkOrders'));
const WorkOrdersNew = lazy(() => import('@/pages/WorkOrders/New'));
const WorkOrdersImport = lazy(() => import('@/pages/WorkOrders/Import'));
const WorkOrdersDetail = lazy(() => import('@/pages/WorkOrders/Detail'));
const MyDispatched = lazy(() => import('@/pages/MyDispatched'));
const MyDispatchedDetail = lazy(() => import('@/pages/MyDispatched/Detail'));
const TeamDispatched = lazy(() => import('@/pages/TeamDispatched'));
const HistoryWorkOrders = lazy(() => import('@/pages/HistoryWorkOrders'));
const ExportTemplates = lazy(() => import('@/pages/ExportTemplates'));
const NotificationsPage = lazy(() => import('@/pages/Notifications'));

const RenewalDetail = lazy(() => import('@/pages/Renewal/Detail'));
const ResignationDetail = lazy(() => import('@/pages/Resignation/Detail'));
const ResignationCert = lazy(() => import('@/pages/Resignation/Cert'));
const BenefitDetail = lazy(() => import('@/pages/Benefit/Detail'));

const AdminUsers = lazy(() => import('@/pages/Admin/Users'));
const AdminRoles = lazy(() => import('@/pages/Admin/Roles'));
const AdminDepartments = lazy(() => import('@/pages/Admin/Departments'));
const AdminCustomers = lazy(() => import('@/pages/Admin/Customers'));
const AdminModuleConfig = lazy(() => import('@/pages/Admin/ModuleConfig'));
const AdminFields = lazy(() => import('@/pages/Admin/Fields'));
const AdminFieldPermissions = lazy(() => import('@/pages/Admin/FieldPermissions'));
const AdminDispatchConfig = lazy(() => import('@/pages/Admin/DispatchConfig'));
const AdminWorkflows = lazy(() => import('@/pages/Admin/Workflows'));
const AdminWorkflowEditor = lazy(() => import('@/pages/Admin/Workflows/Editor'));
const AdminExportTemplates = lazy(() => import('@/pages/Admin/ExportTemplates'));
const AdminLogs = lazy(() => import('@/pages/Admin/Logs'));
const AdminAISettings = lazy(() => import('@/pages/Admin/AISettings'));
const AdminSystemSettings = lazy(() => import('@/pages/Admin/SystemSettings'));
const AdminLoginDebug = lazy(() => import('@/pages/Admin/LoginDebug'));
const AdminCustomerAssignees = lazy(() => import('@/pages/Admin/CustomerAssignees'));
const WorkOrderPool = lazy(() => import('@/pages/WorkOrderPool'));

const Loading: React.FC = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <Spin size="large" />
  </div>
);

/** 为每个路由节点提供局部 ErrorBoundary，一个页面崩不会拖垮整个应用 */
const RouteGuard: React.FC<{ moduleName: string; children: React.ReactNode }> = ({ moduleName, children }) => (
  <ErrorBoundary moduleName={moduleName}>
    <Suspense fallback={<Loading />}>
      {children}
    </Suspense>
  </ErrorBoundary>
);

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoggedIn, user, loading, fetchUser, mustChangePassword } = useUserStore();
  useEffect(() => {
    if (isLoggedIn && !user && !loading) {
      fetchUser();
    }
  }, [isLoggedIn, user, loading, fetchUser]);

  if (!isLoggedIn) return <Navigate to="/login" replace />;
  if (!user) return <Loading />;

  // ★ 首登强制改密：拦截所有非改密页路由
  const path = window.location.pathname;
  if (mustChangePassword && path !== '/change-password' && path !== '/login') {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
};

const RoleRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useUserStore();
  const location = useLocation();
  if (!user) return <Loading />;
  if (!canAccessPath(location.pathname, user.roles, user.permissions)) return <Navigate to="/403" replace />;
  return <>{children}</>;
};

const AppRoutes: React.FC = () => (
  <ErrorBoundary moduleName="路由层">
    <Routes>
      <Route path="/login" element={<RouteGuard moduleName="登录页"><LoginPage /></RouteGuard>} />
      <Route path="/change-password" element={<RouteGuard moduleName="修改密码"><ChangePasswordPage /></RouteGuard>} />
      <Route path="/403" element={<RouteGuard moduleName="403"><Forbidden /></RouteGuard>} />
      <Route path="/404" element={<RouteGuard moduleName="404"><NotFound /></RouteGuard>} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <RouteGuard moduleName="主布局">
              <BasicLayout />
            </RouteGuard>
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<RoleRoute><RouteGuard moduleName="仪表盘"><Dashboard /></RouteGuard></RoleRoute>} />

        <Route path="work-orders" element={<RoleRoute><RouteGuard moduleName="工单列表"><WorkOrders /></RouteGuard></RoleRoute>} />
        <Route path="work-orders/new" element={<RoleRoute><RouteGuard moduleName="新建工单"><WorkOrdersNew /></RouteGuard></RoleRoute>} />
        <Route path="work-orders/import" element={<RoleRoute><RouteGuard moduleName="批量导入"><WorkOrdersImport /></RouteGuard></RoleRoute>} />
        <Route path="work-orders/:id" element={<RoleRoute><RouteGuard moduleName="工单详情"><WorkOrdersDetail /></RouteGuard></RoleRoute>} />

        <Route path="onboarding/:moduleCode" element={<Navigate to="/my-work/pending" replace />} />

        <Route path="my-work/initiated" element={<RoleRoute><RouteGuard moduleName="我发起的"><WorkOrders /></RouteGuard></RoleRoute>} />
        <Route path="my-work/pending" element={<RoleRoute><RouteGuard moduleName="我的待办"><MyDispatched mode="pending" /></RouteGuard></RoleRoute>} />
        <Route path="my-work/done" element={<RoleRoute><RouteGuard moduleName="我的已办"><MyDispatched mode="done" /></RouteGuard></RoleRoute>} />
        <Route path="my-work/team" element={<RoleRoute><RouteGuard moduleName="团队工单"><TeamDispatched /></RouteGuard></RoleRoute>} />
        <Route path="my-work/history" element={<RoleRoute><RouteGuard moduleName="历史工单"><HistoryWorkOrders /></RouteGuard></RoleRoute>} />

        <Route path="my-dispatched" element={<RoleRoute><RouteGuard moduleName="我的子工单"><MyDispatched /></RouteGuard></RoleRoute>} />
        <Route path="my-dispatched/:id" element={<RoleRoute><RouteGuard moduleName="子工单详情"><MyDispatchedDetail /></RouteGuard></RoleRoute>} />

        <Route path="team-dispatched" element={<RoleRoute><RouteGuard moduleName="部门子工单"><TeamDispatched /></RouteGuard></RoleRoute>} />

        <Route path="export-templates" element={<RoleRoute><RouteGuard moduleName="导出模板"><ExportTemplates /></RouteGuard></RoleRoute>} />
        <Route path="notifications" element={<RoleRoute><RouteGuard moduleName="消息通知"><NotificationsPage /></RouteGuard></RoleRoute>} />

        {/* 字段权限入口仅管理员可访问；保留旧路径并由 RoleRoute 按 ADMIN 权限拦截。*/}
        <Route path="my-field-permissions" element={<RoleRoute><RouteGuard moduleName="字段权限"><AdminFieldPermissions /></RouteGuard></RoleRoute>} />

        <Route path="renewal" element={<Navigate to="/work-orders" replace />} />
        <Route path="renewal/new" element={<Navigate to="/work-orders/new" replace />} />
        <Route path="renewal/:id" element={<RoleRoute><RouteGuard moduleName="续签详情"><RenewalDetail /></RouteGuard></RoleRoute>} />

        <Route path="resignation" element={<Navigate to="/work-orders" replace />} />
        <Route path="resignation/new" element={<Navigate to="/work-orders/new" replace />} />
        <Route path="resignation/:id" element={<RoleRoute><RouteGuard moduleName="离职详情"><ResignationDetail /></RouteGuard></RoleRoute>} />
        <Route path="resignation/:id/cert" element={<RoleRoute><RouteGuard moduleName="离职证明"><ResignationCert /></RouteGuard></RoleRoute>} />

        <Route path="benefit" element={<Navigate to="/work-orders" replace />} />
        <Route path="benefit/new" element={<Navigate to="/work-orders/new" replace />} />
        <Route path="benefit/:id" element={<RoleRoute><RouteGuard moduleName="申报详情"><BenefitDetail /></RouteGuard></RoleRoute>} />

        <Route
          path="admin"
          element={
            <RoleRoute>
              <RouteGuard moduleName="管理后台">
                <Outlet />
              </RouteGuard>
            </RoleRoute>
          }
        >
          <Route index element={<Navigate to="/admin/users" replace />} />
          <Route path="users" element={<RouteGuard moduleName="用户管理"><AdminUsers /></RouteGuard>} />
          <Route path="roles" element={<RouteGuard moduleName="角色管理"><AdminRoles /></RouteGuard>} />
          <Route path="departments" element={<RouteGuard moduleName="部门管理"><AdminDepartments /></RouteGuard>} />
          <Route path="customers" element={<RouteGuard moduleName="客户管理"><AdminCustomers /></RouteGuard>} />
          <Route path="module-config" element={<RouteGuard moduleName="模块化配置"><AdminModuleConfig /></RouteGuard>} />
          <Route path="fields" element={<RouteGuard moduleName="字段配置"><AdminFields /></RouteGuard>} />
          <Route path="field-permissions" element={<RouteGuard moduleName="字段权限"><AdminFieldPermissions /></RouteGuard>} />
          <Route path="dispatch-config" element={<RouteGuard moduleName="派发配置"><AdminDispatchConfig /></RouteGuard>} />
          <Route path="workflows" element={<RouteGuard moduleName="工单流程配置"><AdminWorkflows /></RouteGuard>} />
          <Route path="workflow-config" element={<RouteGuard moduleName="工单流程配置"><AdminWorkflows /></RouteGuard>} />
          <Route path="workflows/:id" element={<RouteGuard moduleName="工单流程编辑"><AdminWorkflowEditor /></RouteGuard>} />
          <Route path="export-templates" element={<RouteGuard moduleName="导出模板配置"><AdminExportTemplates /></RouteGuard>} />
          <Route path="logs" element={<RouteGuard moduleName="操作日志"><AdminLogs /></RouteGuard>} />
          <Route path="ai-settings" element={<RouteGuard moduleName="智能设置"><AdminAISettings /></RouteGuard>} />
          <Route path="system-settings" element={<RouteGuard moduleName="系统设置"><AdminSystemSettings /></RouteGuard>} />
          <Route path="login-debug" element={<RouteGuard moduleName="登录诊断"><AdminLoginDebug /></RouteGuard>} />
          <Route path="customer-assignees" element={<RouteGuard moduleName="业务员客户绑定"><AdminCustomerAssignees /></RouteGuard>} />
        </Route>

        <Route path="work-order-pool" element={<RoleRoute><RouteGuard moduleName="待认领工单"><WorkOrderPool /></RouteGuard></RoleRoute>} />
        <Route path="*" element={<RouteGuard moduleName="404"><NotFound /></RouteGuard>} />
      </Route>
    </Routes>
  </ErrorBoundary>
);

export default AppRoutes;
