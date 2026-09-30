import { Request } from 'express';

export interface CustomRequest extends Request {
    validatedBody?: any;
    validatedQuery?: any;
}

// ── Extended (Starknet) ───────────────────────────────────────────────
export interface ExtendedAccount {
    accountId: string;
}

export interface ExtendedBalance {
    equity?: string | number;
    balance?: string | number;
    unrealisedPnl?: string | number;
    unrealizedPnl?: string | number;
}

export interface ExtendedOperation {
    id?: string;
    type: string;
    status: string;
    amount?: string | number;
}

export interface ExtendedTrade {
    id?: string;
    value?: string | number;
    qty?: string | number;
    price?: string | number;
}

export interface ExtendedOrder {
    id?: string;
    status: string;
    filledQty?: string | number;
    averagePrice?: string | number;
}

export interface ExtendedPosition {
    id?: string;
    realisedPnl?: string | number;
}

export interface ExtendedPnlPoint {
    totalPnl?: string | number;
    pnl?: string | number;
    value?: string | number;
    cumulativePnl?: string | number;
}

// ── Nado ─────────────────────────────────────────────────────────────
export interface NadoSubaccount {
    spot_balances?: any[];
    perp_balances?: any[];
    perp_products?: any[];
}

export interface NadoSnapshot {
    net_entry_cumulative?: string | number;
    quote_volume_cumulative?: string | number;
    product_id?: number;
}

export interface NadoEvent {
    pre_balance?: any;
    post_balance?: any;
}

export interface NadoOrder {
    idx?: string;
    product_id?: number;
    realized_pnl?: string | number;
    fee?: string | number;
}

// ── Variational ──────────────────────────────────────────────────────
export interface VariationalPortfolio {
    act_deposit?: number;
    init_deposit?: number;
    pnl?: number;
    volume?: number;
    upnl?: number;
    win_rate?: number;
    sum_balance?: number | string;
}

export interface VariationalTrade {
    id?: string;
}

export interface VariationalPoints {
    total_points?: number | string;
    rank?: number | string;
}

export interface ExtendedBalanceResponse { data: ExtendedBalance; }
export interface ExtendedOperationsResponse { data: ExtendedOperation[]; }
