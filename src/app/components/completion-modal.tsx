import { motion } from 'motion/react';
import { CheckCircle, Receipt, X } from 'lucide-react';
import { useTheme } from '../contexts/theme-context';

interface CompletionModalProps {
  billNumber: string;
  itemCount: number;
  total: number;
  paymentMode: string;
  changeAmount: number;
  onClose: () => void;
  onNewBill: () => void;
}

export function CompletionModal({
  billNumber,
  itemCount,
  total,
  paymentMode,
  changeAmount,
  onClose,
  onNewBill,
}: CompletionModalProps) {
  const { darkMode } = useTheme();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border transition-all ${
          darkMode 
            ? 'bg-slate-900 border-slate-800 text-white shadow-indigo-950/20' 
            : 'bg-white border-gray-100 text-gray-900'
        }`}
      >
        {/* Success Header */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-6 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          >
            <CheckCircle size={64} className="mx-auto text-white mb-3" />
          </motion.div>
          <h2 className="text-2xl font-bold text-white mb-1">
            Bill Generated Successfully!
          </h2>
          <p className="text-green-100 text-sm">
            Transaction completed
          </p>
        </div>

        {/* Bill Summary */}
        <div className="p-6 space-y-4">
          <div className={`rounded-lg p-4 space-y-3 ${
            darkMode ? 'bg-slate-950/40 border border-slate-800/60' : 'bg-gray-55 border border-gray-200/60'
          }`}>
            <div className="flex justify-between items-center">
              <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Bill Number</span>
              <span className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{billNumber}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Total Items</span>
              <span className={`font-semibold ${darkMode ? 'text-slate-200' : 'text-gray-900'}`}>{itemCount}</span>
            </div>
            
            <div className={`flex justify-between items-center border-t pt-3 ${darkMode ? 'border-slate-800' : 'border-gray-200'}`}>
              <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Payment Mode</span>
              <span className={`font-semibold uppercase ${darkMode ? 'text-slate-200' : 'text-gray-900'}`}>{paymentMode}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className={`text-lg font-bold ${darkMode ? 'text-slate-300' : 'text-gray-900'}`}>Amount Paid</span>
              <span className="text-2xl font-bold text-green-500">₹{total.toFixed(2)}</span>
            </div>
            
            {changeAmount > 0 && (
              <div className={`flex justify-between items-center -mx-4 -mb-4 mt-3 p-4 rounded-b-lg ${
                darkMode ? 'bg-amber-950/20 border-t border-amber-900/30' : 'bg-yellow-50'
              }`}>
                <span className={`text-sm font-medium ${darkMode ? 'text-amber-400' : 'text-yellow-800'}`}>Change Returned</span>
                <span className={`text-xl font-bold ${darkMode ? 'text-amber-400' : 'text-yellow-800'}`}>₹{changeAmount.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className={`rounded-lg p-4 border ${
            darkMode 
              ? 'bg-indigo-950/25 border-indigo-900/30 text-indigo-300' 
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
            <p className="text-sm text-center">
              Receipt has been printed. Press <strong>ESC</strong> or click below to start a new bill.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className={`p-4 flex gap-3 border-t ${darkMode ? 'border-slate-800/80 bg-slate-950/10' : 'border-gray-100 bg-white'}`}>
          <button
            onClick={onClose}
            className={`flex-1 px-4 py-3 rounded-lg transition-colors font-medium border cursor-pointer ${
              darkMode 
                ? 'bg-slate-850 hover:bg-slate-800 text-slate-300 border-slate-700/60' 
                : 'bg-gray-150 hover:bg-gray-250 text-gray-700 border-transparent'
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <X size={18} />
              Close
            </span>
          </button>
          <button
            onClick={onNewBill}
            className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2 cursor-pointer"
          >
            <Receipt size={18} />
            New Bill
          </button>
        </div>
      </motion.div>
    </div>
  );
}

