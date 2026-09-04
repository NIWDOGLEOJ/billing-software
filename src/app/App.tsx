import { RouterProvider } from 'react-router';
import { router } from './routes';
import { Toaster } from 'sonner';
import { AuthProvider } from './contexts/auth-context';
import { ThemeProvider } from './contexts/theme-context';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RouterProvider router={router} />
        {/*
          Bottom-right sat directly on top of the totals and checkout button —
          the one part of the screen a cashier must be able to read at all times.
          Top-centre keeps notifications clear of both the cart and the search
          box, and `expand={false}` stacks them instead of fanning them out.
        */}
        <Toaster
          position="top-center"
          richColors
          expand={false}
          visibleToasts={3}
          closeButton
        />
      </AuthProvider>
    </ThemeProvider>
  );
}