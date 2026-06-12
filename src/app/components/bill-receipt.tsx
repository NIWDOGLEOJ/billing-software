import { X, Printer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface BillItem {
  code: string;
  name: string;
  price: number;
  quantity: number;
}

interface ShopDetails {
  name: string;
  address: string;
  phone: string;
  email: string;
}

interface BillReceiptProps {
  items: BillItem[];
  total: number;
  subtotal: number;
  gstAmount: number;
  gstRate: number;
  gstEnabled: boolean;
  shopDetails: ShopDetails;
  cashierName: string;
  billNumber: string;
  onClose: () => void;
}

export function BillReceipt({
  items,
  total,
  subtotal,
  gstAmount,
  gstRate,
  gstEnabled,
  shopDetails,
  cashierName,
  billNumber,
  onClose,
}: BillReceiptProps) {
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    // Generate QR code
    const generateQR = async () => {
      try {
        const QRCode = await import('qrcode');
        if (qrCanvasRef.current) {
          const billData = JSON.stringify({
            billNumber,
            date: currentDate,
            total: total.toFixed(2),
            items: items.length,
            shop: shopDetails.name,
          });

          await QRCode.toCanvas(qrCanvasRef.current, billData, {
            width: 150,
            margin: 1,
          });
        }
      } catch (error) {
        console.error('Error generating QR code:', error);
        setQrError(true);
      }
    };

    generateQR();
  }, [billNumber, currentDate, total, items.length, shopDetails.name]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header Actions */}
        <div className="flex justify-between items-center p-4 border-b print:hidden">
          <h2 className="text-xl font-bold">Bill Receipt</h2>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <Printer size={18} />
              Print
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Receipt Content */}
        <div className="p-8 print:p-4">
          {/* Store Header */}
          <div className="text-center mb-8 border-b-2 border-dashed pb-6">
            <h1 className="text-3xl font-bold mb-2">{shopDetails.name}</h1>
            <p className="text-gray-600">{shopDetails.address}</p>
            <p className="text-gray-600">Phone: {shopDetails.phone}</p>
            <p className="text-gray-600">Email: {shopDetails.email}</p>
          </div>

          {/* Bill Info */}
          <div className="flex justify-between mb-6 text-sm">
            <div>
              <p className="font-semibold">Bill No: {billNumber}</p>
              <p className="text-gray-600">Cashier: {cashierName}</p>
            </div>
            <div className="text-right">
              <p className="text-gray-600">{currentDate}</p>
            </div>
          </div>

          {/* Items Table */}
          <table className="w-full mb-6">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="text-left py-2 text-sm">Item</th>
                <th className="text-center py-2 text-sm">Qty</th>
                <th className="text-right py-2 text-sm">Price</th>
                <th className="text-right py-2 text-sm">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={index} className="border-b border-gray-200">
                  <td className="py-3">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-gray-500">Code: {item.code}</p>
                  </td>
                  <td className="text-center py-3">{item.quantity}</td>
                  <td className="text-right py-3">
                    ₹{item.price.toFixed(2)}
                  </td>
                  <td className="text-right py-3 font-medium">
                    ₹{(item.price * item.quantity).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="border-t-2 border-gray-300 pt-4">
            {gstEnabled ? (
              <div className="space-y-2">
                <div className="flex justify-between text-lg">
                  <span>Subtotal:</span>
                  <span>₹{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg">
                  <span>GST ({gstRate}%):</span>
                  <span>₹{gstAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-2xl font-bold border-t-2 border-gray-400 pt-3">
                  <span>TOTAL:</span>
                  <span>₹{total.toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <div className="flex justify-between text-2xl font-bold pt-3">
                <span>TOTAL:</span>
                <span>₹{total.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Payment Info */}
          <div className="mt-6 text-center text-sm text-gray-600">
            <p className="mb-2">Total Items: {items.reduce((sum, item) => sum + item.quantity, 0)}</p>
            <p>Payment Method: Cash</p>
          </div>

          {/* QR Code */}
          <div className="mt-8 flex justify-center">
            <div className="text-center">
              <canvas ref={qrCanvasRef} className="mx-auto border-2 border-gray-200 rounded-lg p-2"></canvas>
              <p className="text-xs text-gray-500 mt-2">Scan QR to view bill details</p>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t-2 border-dashed text-center">
            <p className="font-semibold mb-2">Thank You for Shopping!</p>
            <p className="text-sm text-gray-600">
              Please keep this receipt for returns and exchanges
            </p>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="flex gap-3 p-4 border-t print:hidden">
          <button
            onClick={handlePrint}
            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Printer size={20} />
            Print Bill
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-lg transition-colors"
          >
            New Bill
          </button>
        </div>
      </div>
    </div>
  );
}