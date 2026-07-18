import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import MapPage from '@/pages/MapPage';

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={MapPage} />
      <Route>
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          404 - Страница не найдена
        </div>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
