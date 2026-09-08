import { useCallback, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

export interface ConfirmOptions {
  title: string;
  description?: string;
  /** Label for the confirming button. Say what it does — "Delete product" beats "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. Use for anything irreversible. */
  destructive?: boolean;
}

/**
 * A promise-based replacement for the native `confirm()`.
 *
 * Native dialogs are OS-styled, ignore the app's theme, and block the whole
 * renderer — which is especially bad on a till running fullscreen. This keeps
 * call sites nearly identical (`if (await confirm({...}))`) while rendering a
 * real in-app dialog.
 *
 * Usage:
 *   const { confirm, confirmDialog } = useConfirm();
 *   ...
 *   if (await confirm({ title: 'Delete this?', destructive: true })) { ... }
 *   ...
 *   return <>{yourUi}{confirmDialog}</>;
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOptions(opts);
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const confirmDialog = (
    <AlertDialog
      open={options !== null}
      // Covers Escape and overlay clicks as well as the Cancel button, so the
      // promise can never be left dangling.
      onOpenChange={(open) => { if (!open) settle(false); }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options?.title}</AlertDialogTitle>
          {options?.description && (
            <AlertDialogDescription>{options.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>
            {options?.cancelLabel || 'Cancel'}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => settle(true)}
            className={options?.destructive ? 'bg-rose-600 text-white hover:bg-rose-700' : undefined}
          >
            {options?.confirmLabel || 'Confirm'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, confirmDialog };
}
