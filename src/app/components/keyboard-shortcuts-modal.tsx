import { motion } from 'motion/react';
import { X, Keyboard as KeyboardIcon } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

export function KeyboardShortcutsModal({ onClose }: KeyboardShortcutsModalProps) {
  const isDark = document.documentElement.classList.contains('dark');
  
  const shortcuts = [
    { key: 'Ctrl + S', description: 'Open Settings' },
    { key: 'Ctrl + H', description: 'Open Bill History' },
    { key: 'Ctrl + N', description: 'Start New Bill' },
    { key: 'Ctrl + F', description: 'Focus Product Search' },
    { key: 'Ctrl + P', description: 'Generate Bill / Print' },
    { key: 'F1', description: 'Select Cash Payment' },
    { key: 'F2', description: 'Select UPI Payment' },
    { key: 'F3', description: 'Select Card Payment' },
    { key: 'F4', description: 'Generate Bill / Print Receipt' },
    { key: 'F5', description: 'Start New Bill' },
    { key: 'ESC', description: 'Clear cart and start new bill (after printing)' },
    { key: 'Enter', description: 'Add highlighted search result' },
    { key: '↑ / ↓', description: 'Navigate search results' },
    { key: 'Tab', description: 'Move to next field' },
    { key: '?', description: 'Show this help dialog' },
    { key: 'Type anywhere', description: 'Auto-focus search box' },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden`}
      >
        {/* Header */}
        <div className={`${isDark ? 'bg-gradient-to-r from-indigo-600 to-purple-600' : 'bg-gradient-to-r from-indigo-500 to-purple-500'} p-6`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <KeyboardIcon size={32} className="text-white" />
              <div>
                <h2 className="text-2xl font-bold text-white">Keyboard Shortcuts</h2>
                <p className={`${isDark ? 'text-indigo-200' : 'text-indigo-100'} text-sm`}>Speed up your workflow</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X size={24} className="text-white" />
            </button>
          </div>
        </div>

        {/* Shortcuts List */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          <div className="grid gap-3">
            {shortcuts.map((shortcut, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`flex items-center justify-between p-4 rounded-lg transition-colors ${
                  isDark 
                    ? 'bg-gray-750 hover:bg-gray-700' 
                    : 'bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <span className={isDark ? 'text-gray-200' : 'text-gray-700'}>{shortcut.description}</span>
                <kbd className={`px-3 py-1.5 border-2 rounded-lg font-mono font-semibold shadow-sm min-w-[60px] text-center ${
                  isDark
                    ? 'bg-gray-800 border-gray-600 text-gray-100'
                    : 'bg-white border-gray-300 text-gray-900'
                }`}>
                  {shortcut.key}
                </kbd>
              </motion.div>
            ))}
          </div>

          <div className={`mt-6 border rounded-lg p-4 ${
            isDark
              ? 'bg-blue-600/20 border-blue-500/30'
              : 'bg-blue-50 border-blue-200'
          }`}>
            <p className={`text-sm ${isDark ? 'text-blue-200' : 'text-blue-800'}`}>
              <strong>Pro Tip:</strong> You can complete an entire billing workflow without touching the mouse!
              Just scan barcodes or type product codes, press Enter, select payment mode with F1-F3, and print with F4 or Ctrl+P.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className={`border-t p-4 ${isDark ? 'bg-gray-750 border-gray-700' : 'bg-gray-50'}`}>
          <button
            onClick={onClose}
            className={`w-full px-4 py-3 rounded-lg transition-colors font-medium ${
              isDark
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            Got it!
          </button>
        </div>
      </motion.div>
    </div>
  );
}
