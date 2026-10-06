import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory stand-in for the one `organizations` row these methods read and write. Only the
// query-builder calls supabaseService.fetchOrgSettings / saveOrgSettings actually make are faked.
const db = vi.hoisted(() => ({ row: {} as Record<string, any>, updateError: null as null | { message: string } }));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: string) => ({
          single: async () => ({ data: db.row }),
          maybeSingle: async () => ({ data: db.row }),
        }),
      }),
      update: (payload: Record<string, any>) => ({
        eq: async (_col: string, _val: string) => {
          if (db.updateError) return { error: db.updateError };
          Object.assign(db.row, payload);
          return { error: null };
        },
      }),
    }),
  },
}));

import { supabaseService } from '../supabaseService';

const baseSettings = { green: 70, amber: 50, red: 30, signature: 'Sig', enableSignature: true };

beforeEach(() => {
  db.row = { custom_signature: 'Sig', settings: {} };
  db.updateError = null;
});

describe('org settings: message templates', () => {
  it('round-trips templates through save and fetch', async () => {
    await supabaseService.saveOrgSettings('org1', 'u1', { ...baseSettings, messageTemplates: { Amber: 'Hi {{name}}' } }, {});
    const res = await supabaseService.fetchOrgSettings('org1', 'u1');
    expect(res?.messageTemplates).toEqual({ Amber: 'Hi {{name}}' });
  });

  it('defaults to no templates when none were ever saved', async () => {
    const res = await supabaseService.fetchOrgSettings('org1', 'u1');
    expect(res?.messageTemplates).toEqual({});
  });

  it('drops blank templates on save, so "custom but empty" falls back to auto', async () => {
    await supabaseService.saveOrgSettings(
      'org1', 'u1', { ...baseSettings, messageTemplates: { Green: 'keep', Red: '   ', Grey: '' } }, {},
    );
    expect(db.row.settings.message_templates).toEqual({ Green: 'keep' });
  });

  it('clears templates when the caller passes an empty set', async () => {
    db.row.settings = { message_templates: { Green: 'old' } };
    await supabaseService.saveOrgSettings('org1', 'u1', { ...baseSettings, messageTemplates: {} }, {});
    expect(db.row.settings.message_templates).toEqual({});
  });

  it('leaves existing templates alone when a save does not mention them (e.g. "Reset to defaults")', async () => {
    db.row.settings = { message_templates: { Green: 'precious wording' } };
    await supabaseService.saveOrgSettings('org1', 'u1', { ...baseSettings }, {});
    expect(db.row.settings.message_templates).toEqual({ Green: 'precious wording' });
  });

  it('preserves unrelated keys already in settings', async () => {
    db.row.settings = { some_other_feature: { on: true } };
    await supabaseService.saveOrgSettings('org1', 'u1', { ...baseSettings, messageTemplates: { Green: 'x' } }, {});
    expect(db.row.settings.some_other_feature).toEqual({ on: true });
  });

  it('sanitises malformed stored data instead of passing it to the UI', async () => {
    db.row.settings = { message_templates: { Green: 5, Bogus: 'x', Amber: 'ok' } };
    const res = await supabaseService.fetchOrgSettings('org1', 'u1');
    expect(res?.messageTemplates).toEqual({ Amber: 'ok' });
  });

  it('reports failure when the write fails, so the UI can say so', async () => {
    db.updateError = { message: 'rls' };
    expect(await supabaseService.saveOrgSettings('org1', 'u1', { ...baseSettings }, {})).toBe(false);
  });
});

describe('org settings: default country code', () => {
  it('persists and reloads a non-default country code (it used to revert to +91)', async () => {
    await supabaseService.saveOrgSettings('org1', 'u1', { ...baseSettings, defaultCountryCode: '+44' }, {});
    const res = await supabaseService.fetchOrgSettings('org1', 'u1');
    expect(res?.defaultCountryCode).toBe('+44');
  });

  it('reads the camelCase key earlier versions wrote, so existing chapters keep their value', async () => {
    db.row.settings = { defaultCountryCode: '+971' };
    const res = await supabaseService.fetchOrgSettings('org1', 'u1');
    expect(res?.defaultCountryCode).toBe('+971');
  });

  it('migrates the stale camelCase key to the canonical one on the next save', async () => {
    db.row.settings = { defaultCountryCode: '+971' };
    await supabaseService.saveOrgSettings('org1', 'u1', { ...baseSettings, defaultCountryCode: '+971' }, {});
    expect(db.row.settings.default_country_code).toBe('+971');
    expect(db.row.settings).not.toHaveProperty('defaultCountryCode');
  });

  it('falls back to +91 when nothing was ever set', async () => {
    const res = await supabaseService.fetchOrgSettings('org1', 'u1');
    expect(res?.defaultCountryCode).toBe('+91');
  });
});
