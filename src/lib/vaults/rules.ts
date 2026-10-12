import { flows } from "@acta-markets/ts-sdk/chain";

export type VaultActionBlock = flows.VaultActionBlock;

export const {
  requestDepositBlock,
  cancelDepositBlock,
  refundDepositBlock,
  requestWithdrawBlock,
  cancelWithdrawBlock,
  selfProcessDepositBlock,
  selfProcessWithdrawBlock,
  processIdleWithdrawalBlock,
  processEquityBlock,
  processWithdrawalsBlock,
  processFinalWithdrawalBlock,
  processDepositsBlock,
  refundRestrictedDepositsBlock,
  finalizeCycleBlock,
  setAcceptingDepositsBlock,
} = flows;
