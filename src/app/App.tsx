import { RouterProvider } from 'react-router';
import { router } from './routes';
import { Toaster } from 'sonner';
import { AuthProvider } from './contexts/auth-context';
import { ThemeProvider } from './contexts/theme-context';
import { InitializeAuth } from './components/initialize-auth';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <InitializeAuth />
        <RouterProvider router={router} />
        <Toaster position="bottom-right" richColors expand={true} />
      </AuthProvider>
    </ThemeProvider>
  );
}