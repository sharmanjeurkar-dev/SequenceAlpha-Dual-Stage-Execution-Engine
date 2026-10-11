import torch
from pytorch_forecasting import QuantileLoss
from torch import nn


class DirectionaMagnitudelLoss(nn.Module):
    def __init__(self, dir_weights=5.0, mag_scaler=1000.0):
        super().__init__()
        self.dir_weights = dir_weights
        self.mag_scaler = mag_scaler

    def forward(self, predictions, targets):
        a = torch.sign(predictions)
        b = torch.sign(targets)
        basic_loss = torch.subtract(predictions, targets)
        basic_loss = torch.abs(basic_loss)

        directional_penelty = torch.where(a == b, 1.0, self.dir_weights)
        magnitude_penelty = 1.0 + (torch.abs(targets) * self.mag_scaler)
        final_loss = torch.mean(directional_penelty * magnitude_penelty * basic_loss)

        return final_loss


class SharpeRatio(nn.Module):
    def __init__(
        self, risk_free_rate=0.0, holding_cost=0.0005, transaction_cost=0.00002
    ):
        super().__init__()
        self.risk_free_rate = risk_free_rate
        self.holding_cost = holding_cost
        self.transaction_cost = transaction_cost

    def forward(self, predicted_position, returns):
        pnl = predicted_position * returns
        position_change = torch.diff(
            predicted_position,
            dim=0,
            prepend=torch.zeros(1, 1, device=predicted_position.device),
        )
        transaction_fee = torch.abs(position_change) * self.transaction_cost
        holding_fee = torch.abs(predicted_position) * self.holding_cost
        net_pnl = pnl - holding_fee - transaction_fee

        mean_net_pnl = torch.mean(net_pnl)
        std_net_pnl = torch.std(net_pnl)
        epsilon = 1e-6

        annualized_mean = 252 * mean_net_pnl
        annualized_std = std_net_pnl * 252**0.5

        sharpe_ratio = (annualized_mean - self.risk_free_rate) / (
            annualized_std + epsilon
        )

        return -sharpe_ratio


class HybridQuantileLoss(QuantileLoss):
    def __init__(
        self,
        quantiles: list[float] | None = None,
        dir_weights: float = 1.75,
        smooth_scale: float = 50.0,
    ):
        if quantiles is None:
            quantiles = [0.1, 0.5, 0.9]

        super().__init__(quantiles=quantiles)
        self.dir_weights = dir_weights
        self.smooth_scale = smooth_scale

    def loss(self, predicted: torch.Tensor, real: torch.Tensor) -> torch.Tensor:
        raw_loss = super().loss(predicted, real)
        p_50 = predicted[..., 1]

        # Smooth, differentiable directional alignment in [-1, +1] across 0.0:
        # +1 when p_50 and real share the same sign, -1 when opposite signs.
        target_sign = torch.sign(real)
        smooth_pred_sign = torch.tanh(self.smooth_scale * p_50)
        sign_align = target_sign * smooth_pred_sign

        # Smooth multiplier: 1.0 when aligned (+1), dir_weights (1.75) when opposite (-1)
        direction_mult = 1.0 + (self.dir_weights - 1.0) * 0.5 * (1.0 - sign_align)

        # Apply directional penalty strictly to p50 (index 1) so p10 and p90 remain pure quantiles
        loss = raw_loss.clone()
        loss[..., 1] = raw_loss[..., 1] * direction_mult
        return loss

