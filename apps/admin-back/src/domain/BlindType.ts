/** Blind level in structure */
export type BlindLevel = number;

/** Blind ID */
export type BlindId = number;

/** Blind size (chips) */
export type BlindSize = number;

/** Blind level length in minutes (clock converts to seconds) */
export type BlindDuration = number;

/** Break length in minutes (clock converts to seconds) */
export type BreakDuration = number;

/** Blind level with small/big blinds and optional ante */
export interface Blind {
  type: "Blind";
  level: BlindLevel;
  id: BlindId;
  smallBlind: BlindSize;
  bigBlind: BlindSize;
  ante: boolean;
  duration: BlindDuration;
}

/** Break between blind levels */
export interface Break {
  type: "Break";
  id: BlindId;
  duration: BreakDuration;
  /**
   * When true, reaching this break automatically closes late registration
   * (the rebuy zone) and signals the live screen to show rating points.
   */
  endsLateRegistration?: boolean;
}

/** Blind level or break */
export type BlindType = Blind | Break;
