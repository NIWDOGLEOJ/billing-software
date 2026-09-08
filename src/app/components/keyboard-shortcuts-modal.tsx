import { useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Keyboard as KeyboardIcon } from 'lucide-react';
import { MONO, EYEBROW, KBD } from '../lib/design-system';

interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

export function KeyboardShortcutsModal({ onClose }: KeyboardShortcutsModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const shortcuts = [
    { key: 'F2 / Ctrl F', description: 'Focus Barcode / Product Search' },
    { key: '↑ / ↓', description: 'Navigate search results / bills / tabs' },
    { key: 'Enter', description: 'Add item / select option / confirm' },
    { key: 'F8', description: 'Proceed to Payment (Step 2)' },
    { key: 'F7', description: 'Back to Items (Step 1)' },
    { key: 'F1', description: 'Select Cash Payment' },
    { key: 'Alt+U / F10', description: 'Select UPI Payment' },
    { key: 'F3', description: 'Select Card Payment' },
    { key: 'F6', description: 'Select Ledger / Khata (unpaid credit)' },
    { key: 'F9 / F4', description: 'Print Receipt / Tax Invoice' },
    { key: 'F5 / Ctrl N', description: 'Start New Bill' },
    { key: 'ESC', description: 'Dismiss modal, drawer, or scanner' },
    { key: '↑ / ↓ / + / -', description: 'Adjust Cart Item Quantity' },
    { key: 'Ctrl H', description: 'Open Bill History' },
    { key: 'Ctrl S', description: 'Open Settings (Full Screen)' },
    { key: 'Tab / Shift+Tab', description: 'Navigate next / previous field' },
    { key: 'Type anywhere', description: 'Arm barcode scanner / auto-search' },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4 font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-xl rounded-xl overflow-hidden flex flex-col shadow-2xl"
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          color: 'var(--ink)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--rule2)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center"
              style={{ background: 'var(--sub)', border: '1px solid var(--border2)', color: 'var(--ink2)' }}
            >
              <KeyboardIcon size={16} />
            </div>
            <div>
              <div style={EYEBROW}>Terminal Navigation</div>
              <h2 className="text-base font-bold text-[var(--ink)]">Keyboard Shortcuts</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md flex items-center justify-center cursor-pointer transition-colors"
            style={{
              background: 'var(--sub)',
              border: '1px solid var(--border2)',
              color: 'var(--ink3)',
            }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="p-5 max-h-[60vh] overflow-y-auto space-y-2">
          {shortcuts.map((shortcut, index) => (
            <div
              key={index}
              className="flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs"
              style={{
                background: 'var(--sub)',
                border: '1px solid var(--rule2)',
              }}
            >
              <span style={{ color: 'var(--ink2)' }}>{shortcut.description}</span>
              <kbd style={{ ...KBD, fontSize: 11 }}>{shortcut.key}</kbd>
            </div>
          ))}

          <div
            className="mt-4 p-3.5 rounded-lg text-xs leading-relaxed"
            style={{
              background: 'var(--accent-soft)',
              border: '1px solid var(--accent-line)',
              color: 'var(--accent-hi)',
            }}
          >
            <strong>Cashier Workflow:</strong> Type code or scan &rarr; <kbd style={{ ...KBD, fontSize: 10 }}>Enter</kbd> to add &rarr; <kbd style={{ ...KBD, fontSize: 10 }}>F8</kbd> to pay &rarr; <kbd style={{ ...KBD, fontSize: 10 }}>F1-F3</kbd> for tender &rarr; <kbd style={{ ...KBD, fontSize: 10 }}>F4</kbd> to commit &amp; print.
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 flex items-center justify-end"
          style={{
            background: 'var(--sub)',
            borderTop: '1px solid var(--rule2)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-md text-xs font-semibold cursor-pointer"
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border2)',
              color: 'var(--ink2)',
            }}
          >
            Dismiss
          </button>
        </div>
      </motion.div>
    </div>
  );
}
