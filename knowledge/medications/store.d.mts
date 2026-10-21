// Types for the package runtime store.mjs (server-only, Node.js). The runtime itself is unchanged.

export type NameType = 'brand_name' | 'generic_name' | 'substance_name' | string;

export type StoreRecord = {
  record_id: number;
  source: 'label' | 'ndc';
  external_id: string;
  group_id: string;
  snapshot_effective_time: string;
};

export type StoreCandidate = StoreRecord & { name_type: NameType; matched_name: string };

export type MisEntry = {
  id: string;
  kind: string;
  name_ka: string;
  name_en: string;
  source_url: string;
  catalog_url: string;
  identity_status: string;
  clinical_instructions_available: boolean;
  is_placeholder: boolean;
  source_row_sha256: string;
};

export type LookupResult = {
  query: string;
  status: 'product_selection_required' | 'catalog_name_only' | 'unknown_name';
  candidates: StoreCandidate[];
  total: number;
  offset: number;
  limit: number;
  mis_catalog: MisEntry[];
  allow_instruction_generation: false;
  fuzzy_matching_used: false;
};

export type FetchedCandidate = {
  meta: StoreRecord;
  source: Record<string, unknown>;
  content_sha256: string;
  retrieved_at: string;
  allow_instruction_generation: false;
};

export type ConfirmationReceipt = {
  record_id: number;
  query_normalized: string;
  content_sha256: string;
  expires_at: number;
};

export class MedicationStore {
  constructor(opts?: {
    root?: string;
    fetchImpl?: (url: URL, init?: RequestInit) => Promise<Response>;
    resolveConfirmation?: (token: unknown) => Promise<ConfirmationReceipt | null>;
  });
  root: string;
  fetchImpl: (url: URL, init?: RequestInit) => Promise<Response>;
  resolveConfirmation: (token: unknown) => Promise<ConfirmationReceipt | null>;
  cache: Map<string, unknown>;
  manifest: { files: Record<string, { bytes: number; sha256: string }>; [k: string]: unknown };
  init(): Promise<this>;
  normalize(s: string): string;
  load(file: string): Promise<unknown>;
  matches(query: string): Promise<{ f: [number, NameType, string][]; m: string[] }>;
  record(id: number): Promise<StoreRecord>;
  lookup(query: string, page?: { offset?: number; limit?: number }): Promise<LookupResult>;
  fetchCandidate(query: string, id: number): Promise<FetchedCandidate>;
  context(
    query: string,
    id: number,
    confirmationToken: unknown,
  ): Promise<FetchedCandidate & { clinical_text_available: boolean; identity_confirmed: true; clinical_validation_performed: false; executable_prescription: false }>;
}
