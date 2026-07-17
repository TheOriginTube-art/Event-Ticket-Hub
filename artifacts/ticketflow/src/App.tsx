import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { Route, Switch, Router as WouterRouter } from 'wouter';

import { CityProvider } from '@/lib/city-context';
import { AuthProvider } from '@/lib/auth-context';
import { Shell } from '@/components/layout/Shell';
import Home from '@/pages/Home';
import Events from '@/pages/Events';
import EventDetail from '@/pages/EventDetail';
import CheckoutSuccess from '@/pages/CheckoutSuccess';
import CheckoutPay from '@/pages/CheckoutPay';
import CheckoutCancel from '@/pages/CheckoutCancel';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Account from '@/pages/Account';
import AdminOrders from '@/pages/admin/AdminOrders';
import AdminSettings from '@/pages/admin/AdminSettings';
import AdminDashboard from '@/pages/admin/AdminDashboard';
import AdminEvents from '@/pages/admin/AdminEvents';
import AdminEventSessions from '@/pages/admin/AdminEventSessions';
import AdminVenues from '@/pages/admin/AdminVenues';
import AdminUsers from '@/pages/admin/AdminUsers';
import AdminAIConsultant from '@/pages/admin/AdminAIConsultant';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/events" component={Events} />
        <Route path="/events/:id" component={EventDetail} />
        <Route path="/checkout/success" component={CheckoutSuccess} />
        <Route path="/checkout/pay" component={CheckoutPay} />
        <Route path="/checkout/cancel" component={CheckoutCancel} />
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/account" component={Account} />
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/orders" component={AdminOrders} />
        <Route path="/admin/events" component={AdminEvents} />
        <Route path="/admin/events/:id/sessions" component={AdminEventSessions} />
        <Route path="/admin/venues" component={AdminVenues} />
        <Route path="/admin/users" component={AdminUsers} />
        <Route path="/admin/settings" component={AdminSettings} />
        <Route path="/admin/ai-consultant" component={AdminAIConsultant} />
        <Route>
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[50vh]">
            <h1 className="text-4xl font-bold mb-2">404</h1>
            <p className="text-muted-foreground">Страница не найдена</p>
          </div>
        </Route>
      </Switch>
    </Shell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CityProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </CityProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
