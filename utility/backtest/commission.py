"""
Realistic Indian Equity Delivery Commission and Cost Scheme for Backtrader.
Models STT, Exchange Turnover Fees, Stamp Duty, SEBI Fees, Brokerage, and GST.
"""

import backtrader as bt


class NSEEquityCommissionScheme(bt.CommInfoBase):
    """
    NSE Equity Delivery Cost Model:
    - Brokerage: Min(₹20, 0.05% of trade value)
    - STT (Securities Transaction Tax): 0.1% on both Buy and Sell turnover
    - Exchange Turnover Charge (NSE): 0.00345% of trade value
    - Stamp Duty: 0.015% on Buy turnover only
    - SEBI Turnover Fee: ₹10 per crore (0.0001% of trade value)
    - GST: 18% on (Brokerage + Exchange Charge + SEBI Fee)
    """

    params = (
        ("stocklike", True),
        ("commtype", bt.CommInfoBase.COMM_FIXED),
        ("percabs", True),
        ("stt_rate", 0.0010),  # 0.1% STT on Buy & Sell
        ("exchange_rate", 0.0000345),  # 0.00345% NSE turnover charge
        ("stamp_duty_rate", 0.00015),  # 0.015% on Buy only
        ("sebi_fee_rate", 0.000001),  # 0.0001% SEBI fee
        ("brokerage_flat", 20.0),  # Flat ₹20 / order
        ("brokerage_perc", 0.0005),  # Max 0.05% brokerage
        ("gst_rate", 0.18),  # 18% GST
    )

    def _getcommission(self, size, price, pseudoexec):
        """
        Calculate total transaction cost for order execution.
        """
        turnover = abs(size) * price
        if turnover <= 0:
            return 0.0

        is_buy = size > 0

        # 1. Brokerage: Min(₹20, 0.05% of turnover)
        brokerage = min(self.p.brokerage_flat, turnover * self.p.brokerage_perc)

        # 2. STT: 0.1% on both Buy & Sell delivery
        stt = turnover * self.p.stt_rate

        # 3. Exchange Turnover Charge
        exchange_charge = turnover * self.p.exchange_rate

        # 4. Stamp Duty (Buy side only)
        stamp_duty = (turnover * self.p.stamp_duty_rate) if is_buy else 0.0

        # 5. SEBI Fee
        sebi_fee = turnover * self.p.sebi_fee_rate

        # 6. GST: 18% on (brokerage + exchange charge + sebi fee)
        gst = (brokerage + exchange_charge + sebi_fee) * self.p.gst_rate

        total_cost = brokerage + stt + exchange_charge + stamp_duty + sebi_fee + gst
        return total_cost

    def getvalue(self, position, price):
        """
        Safe portfolio valuation preventing NaN propagation if an inactive asset's price is NaN.
        """
        if position.size == 0 or price is None or price != price:  # price != price checks for NaN
            return 0.0
        return position.size * price

    def getvaluesize(self, size, price):
        """
        Safe position size valuation for BackBroker when shortcash=True.
        """
        if size == 0 or price is None or price != price:
            return 0.0
        return size * price

    def profitandloss(self, size, price, newprice):
        """
        Safe unrealized PnL calculation preventing NaN propagation.
        """
        if size == 0 or price is None or newprice is None or price != price or newprice != newprice:
            return 0.0
        return size * (newprice - price)

