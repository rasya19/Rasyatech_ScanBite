import React from 'react';
import { UserBill } from '../types';

interface DigitalReceiptProps {
  orderData: any; 
  className?: string; // Optional wrapper styling
}

export const DigitalReceipt: React.FC<DigitalReceiptProps> = ({ orderData, className = '' }) => {
  if (!orderData) return null;

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(price || 0);
  };

  // Extract variables, fallback for both snake_case (Checkout state) and camelCase (Admin database order format)
  const orderId = orderData.id;
  const rawDate = orderData.created_at || orderData.createdAt;
  const formattedDate = rawDate ? (isNaN(Date.parse(rawDate)) ? rawDate : new Date(rawDate).toLocaleDateString('id-ID')) : '-';
  const rawTime = orderData.createdAt || ''; // usually time string like '12:00'
  const tableNum = orderData.table_number || orderData.tableNumber || '-';
  const custName = orderData.customer_name || orderData.customerName || 'Pelanggan';
  const grandTotal = orderData.total_price || orderData.totalPrice || 0;

  // Retrieve Rates from localStorage
  const taxRatePercent = Number(localStorage.getItem('scanbite_tax_percent') || '10');
  const serviceRatePercent = Number(localStorage.getItem('scanbite_service_charge_percent') || '5');
  const taxRate = taxRatePercent / 100;
  const serviceRate = serviceRatePercent / 100;

  // Determine Subtotal, Tax, Service
  const orderTax = orderData.tax !== undefined ? orderData.tax : Math.round((grandTotal / (1 + taxRate + serviceRate)) * taxRate);
  const orderService = orderData.service !== undefined ? orderData.service : Math.round((grandTotal / (1 + taxRate + serviceRate)) * serviceRate);
  const calculatedSubtotal = grandTotal - orderTax - orderService;

  // Extract Split Bills
  const splitBills: UserBill[] = orderData.splitBills || orderData.split_bills || [];
  const qrisBills = splitBills.filter(b => b.isPaid && (b.payMethod === 'qris' || b.pay_method === 'qris'));
  const cashBills = splitBills.filter(b => b.isPaid && (b.payMethod === 'cash' || b.pay_method === 'cash'));
  const hasSplit = qrisBills.length > 0 && cashBills.length > 0;

  const paymentMethodLabel = orderData.payment_method_label || orderData.paymentMethodLabel || 
    (orderData.payment_method === 'cash' || orderData.paymentMethod === 'cash' ? 'Tunai / Cash' : 'QRIS / E-Wallet');
  
  const paymentMethod = orderData.payment_method || orderData.paymentMethod || 'qris';
  const amountPaid = orderData.amountPaid !== undefined ? orderData.amountPaid : grandTotal;
  const changeAmount = orderData.changeAmount !== undefined ? orderData.changeAmount : 0;

  const cafeName = localStorage.getItem('scanbite_cafe_name') || 'ScanBite Bistro & Cafe';
  const logo = localStorage.getItem('scanbite_merchant_logo');

  return (
    <div className={`bg-white text-black p-5 rounded-2xl mx-auto border border-gray-200 digital-receipt-print font-mono text-xs ${className}`} style={{ maxWidth: '400px' }}>
      
      {/* HEADER */}
      <div className="text-center mb-5 flex flex-col items-center">
        {logo && (
          <img src={logo} alt="Logo" className="h-12 w-12 rounded-full mb-2 object-contain" referrerPolicy="no-referrer" />
        )}
        <h1 className="text-sm font-black uppercase text-gray-900 tracking-tight leading-tight">{cafeName}</h1>
        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-tight">Jl. Boulevard No. 45, Jakarta</p>
        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-tight">Telp: +62 812-3456-7890</p>
      </div>

      {/* METADATA CONTAINER */}
      <div className="border-t border-dashed border-gray-300 py-3 text-[10px] space-y-1 font-medium text-gray-800">
        <div className="flex justify-between items-start">
          <span className="text-gray-500">ID ORDER:</span>
          <span className="font-bold text-right truncate pl-2">#ORD-{orderId}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">TANGGAL:</span>
          <span className="text-right">{formattedDate} {rawTime}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">MEJA:</span>
          <span className="font-bold text-right">Meja {tableNum}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">STATUS MEJA:</span>
          <span className="font-bold text-right text-emerald-700 uppercase">{orderData.table_status || orderData.tableStatus || 'TERISI'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">PELANGGAN:</span>
          <span className="font-bold text-right uppercase">{custName}</span>
        </div>
      </div>

      {/* LIST OF ORDER ITEMS */}
      <div className="border-t border-dashed border-gray-300 pt-3 pb-1">
        <div className="flex justify-between text-[10px] font-black text-gray-900 uppercase tracking-wider mb-2 border-b border-gray-200 pb-2">
          <div className="w-1/2">Menu</div>
          <div className="w-12 text-center">Qty</div>
          <div className="w-1/4 text-right">Harga</div>
          <div className="w-1/4 text-right">Total</div>
        </div>

        {/* QRIS SPLIT BILL BLOCK */}
        {qrisBills.length > 0 && (
          <div className="mb-4">
            {hasSplit && (
              <div className="text-[8px] font-black uppercase bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200 inline-block mb-2">
                Blok: QRIS / E-Wallet
              </div>
            )}
            {qrisBills.map((bill, idx) => (
              <div key={idx} className="mb-3">
                <p className="text-[9px] font-bold text-blue-800 uppercase tracking-tight mb-1">» {bill.name}</p>
                {bill.items.map((item, iIdx) => (
                  <div key={iIdx} className="flex justify-between text-[11px] py-1 text-gray-700 border-b border-gray-50 last:border-0 items-start">
                    <div className="w-1/2 pr-2 font-bold break-words leading-tight">{item.name}</div>
                    <div className="w-12 text-center text-gray-500">x{item.quantity}</div>
                    <div className="w-1/4 text-right text-gray-500 whitespace-nowrap">{formatPrice(item.price)}</div>
                    <div className="w-1/4 text-right font-bold whitespace-nowrap text-gray-900">{formatPrice(item.price * item.quantity)}</div>
                  </div>
                ))}
              </div>
            ))}
            
            {/* QRIS Subtotal */}
            <div className="flex justify-between items-center text-[10px] font-bold pt-1.5 text-blue-900 border-t border-dashed border-gray-100">
              <span>SUBTOTAL QRIS</span>
              <span className="font-bold">{formatPrice(qrisBills.reduce((sum, b) => sum + b.items.reduce((s, i) => s + i.total, 0), 0))}</span>
            </div>
            {hasSplit && <div className="border-b-2 border-dashed border-gray-200 my-4"></div>}
          </div>
        )}

        {/* CASH SPLIT BILL BLOCK */}
        {cashBills.length > 0 && (
          <div className="mb-4">
            {hasSplit && (
              <div className="text-[8px] font-black uppercase bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 inline-block mb-2">
                Blok: Tunai / Cash
              </div>
            )}
            {cashBills.map((bill, idx) => (
              <div key={idx} className="mb-3">
                <p className="text-[9px] font-bold text-emerald-800 uppercase tracking-tight mb-1">» {bill.name}</p>
                {bill.items.map((item, iIdx) => (
                  <div key={iIdx} className="flex justify-between text-[11px] py-1 text-gray-700 border-b border-gray-50 last:border-0 items-start">
                    <div className="w-1/2 pr-2 font-bold break-words leading-tight">{item.name}</div>
                    <div className="w-12 text-center text-gray-500">x{item.quantity}</div>
                    <div className="w-1/4 text-right text-gray-500 whitespace-nowrap">{formatPrice(item.price)}</div>
                    <div className="w-1/4 text-right font-bold whitespace-nowrap text-gray-900">{formatPrice(item.price * item.quantity)}</div>
                  </div>
                ))}
              </div>
            ))}
            
            {/* CASH Payment details */}
            <div className="bg-gray-55 p-2 rounded-lg mt-2 border border-gray-200 border-dashed">
              <div className="flex justify-between items-center text-[10px] font-bold text-gray-700 mb-1">
                <span>SUBTOTAL TUNAI:</span>
                <span>{formatPrice(cashBills.reduce((sum, b) => sum + b.items.reduce((s, i) => s + i.total, 0), 0))}</span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-gray-500 font-medium mb-1">
                <span>UANG DIBAYAR:</span>
                <span>{formatPrice(amountPaid)}</span>
              </div>
              <div className="flex justify-between items-center text-[11px] font-bold text-emerald-700 pt-1 border-t border-gray-300">
                <span>KEMBALIAN:</span>
                <span>{formatPrice(changeAmount)}</span>
              </div>
            </div>
            
            <p className="text-[8px] text-gray-400 italic mt-2 text-center leading-tight">
              *Pastikan bagian 'Kembalian' hanya muncul pada blok pembayaran Tunai saja agar pelanggan yang membayar via QRIS tidak bingung melihat angka kembalian yang tidak relevan bagi mereka.
            </p>
          </div>
        )}
        
        {/* LOCAL DEFAULT RENDER (IF NO SPLIT SYSTEM SPECIFIED) */}
        {!hasSplit && (splitBills.length === 0) && orderData.items && (
          <div className="mb-4">
             {orderData.items.map((item: any, iIdx: number) => (
                <div key={iIdx} className="flex justify-between text-[11px] py-1 text-gray-700 border-b border-gray-50 last:border-0 items-start">
                  <div className="w-1/2 pr-2 font-bold break-words leading-tight">{item.name}</div>
                  <div className="w-12 text-center text-gray-500">x{item.quantity}</div>
                  <div className="w-1/4 text-right text-gray-500 whitespace-nowrap">{formatPrice(item.price)}</div>
                  <div className="w-1/4 text-right font-bold whitespace-nowrap text-gray-900">{formatPrice(item.price * item.quantity)}</div>
                </div>
             ))}
             
             <div className="bg-gray-55 p-2.5 rounded-xl mt-3 border border-gray-200 border-dashed space-y-1">
              <div className="flex justify-between items-center text-[10px] text-gray-600">
                <span>METODE PEMBAYARAN:</span>
                <span className="font-bold uppercase text-gray-950">{paymentMethodLabel}</span>
              </div>
              
              {/* Payment Details */}
              {paymentMethod === 'cash' ? (
                <>
                  <div className="flex justify-between items-center text-[10px] text-gray-600">
                    <span>UANG DIBAYAR:</span>
                    <span>{formatPrice(amountPaid)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-bold text-emerald-700 pt-1 border-t border-gray-300 mt-1">
                    <span>KEMBALIAN:</span>
                    <span>{formatPrice(changeAmount)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between items-center text-[10px] text-gray-650 font-bold bg-blue-50 text-blue-800 p-1 px-2 rounded mt-1">
                  <span>STATUS PEMBAYARAN:</span>
                  <span className="font-black uppercase">LUNAS QRIS</span>
                </div>
              )}
            </div>
            
            {paymentMethod === 'cash' && (
              <p className="text-[8px] text-gray-400 italic mt-2 text-center leading-tight">
                *Pastikan bagian 'Kembalian' hanya muncul pada blok pembayaran Tunai saja agar pelanggan yang membayar via QRIS tidak bingung melihat angka kembalian yang tidak relevan bagi mereka.
              </p>
            )}
          </div>
        )}
      </div>

      {/* FINAL SUMMARY (REFERENSI POS) */}
      <div className="border-t border-double border-gray-400 pt-3 mt-4 space-y-1 bg-gray-50 -mx-5 px-5 pb-4 -mb-5 rounded-b-2xl">
        <div className="flex justify-between text-[11px] text-gray-605">
          <span>SUBTOTAL REFERENSI:</span>
          <span>{formatPrice(calculatedSubtotal)}</span>
        </div>
        <div className="flex justify-between text-[11px] text-gray-600">
          <span>PAJAK (PB1 {taxRatePercent}%):</span>
          <span>{formatPrice(orderTax)}</span>
        </div>
        <div className="flex justify-between text-[11px] text-gray-600">
          <span>BIAYA PELAYANAN ({serviceRatePercent}%):</span>
          <span>{formatPrice(orderService)}</span>
        </div>
        <div className="flex justify-between text-base font-black text-gray-950 pt-2 border-t border-gray-300 mt-1.5">
          <span>TOTAL AKHIR MEJA</span>
          <span className="text-emerald-700 font-extrabold">{formatPrice(grandTotal)}</span>
        </div>
        <div className="text-center text-[9px] text-gray-400 font-bold uppercase tracking-wider pt-6 pb-1">
          Terima Kasih, Selamat Menikmati! <br/>
          <span className="font-medium normal-case text-gray-400 block mt-0.5">Sistem Kasir ScanBite</span>
        </div>
      </div>
      
    </div>
  );
};
