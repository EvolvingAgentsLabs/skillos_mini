/**
 * Share tools — hand off files to native share sheets.
 *
 * STATUS: stubs. Real implementations land with the mobile/ wiring PR.
 * Real impl wraps `@capacitor/share` (per CLAUDE.md §7.6). WhatsApp gets
 * first-class support: pre-fills the share sheet with the client's phone
 * if it's in `recipient_hint`.
 *
 * IMPORTANT (per CLAUDE.md §9.3 privacy invariants):
 *   `share.toWhatsApp` is NOT a network call. It hands off to the OS share
 *   sheet. The user controls what happens next. The library has no
 *   `network.*` tools.
 */

import type { ToolContext, ActionToolResult } from './types';

export interface ToWhatsAppArgs {
  file_uri: string;                       // from a previous render tool call
  recipient_hint?: string;                // phone number / @user; pre-fills sheet
  message?: string;                       // accompanying text
}

export function toWhatsApp(
  args: ToWhatsAppArgs,
  _ctx: ToolContext,
): ActionToolResult {
  // STUB. See MIGRATION_PLAN.md step 5.
  // Real impl checks WhatsApp install + falls back to generic share if absent.
  if (!args.file_uri) {
    return {
      verdict: 'fail',
      error: 'file_uri required',
    };
  }
  return {
    verdict: 'pass',
    uri: `mock://shared/${args.file_uri}`,
  };
}

export interface ToEmailArgs {
  file_uri: string;
  recipient?: string;
  subject?: string;
  message?: string;
}

export function toEmail(
  args: ToEmailArgs,
  _ctx: ToolContext,
): ActionToolResult {
  // STUB.
  if (!args.file_uri) {
    return {
      verdict: 'fail',
      error: 'file_uri required',
    };
  }
  return {
    verdict: 'pass',
    uri: `mock://emailed/${args.file_uri}`,
  };
}

export interface ToDriveArgs {
  file_uri: string;
  folder?: string;
}

export function toDrive(
  args: ToDriveArgs,
  _ctx: ToolContext,
): ActionToolResult {
  // STUB. NOTE: Drive backup is v1.1 per CLAUDE.md §3.3, but the share
  // hand-off (user-initiated, OS-mediated) is allowed in v1.0 because it
  // does not violate §9.3 — the app does not make the network call, the
  // OS share sheet does.
  if (!args.file_uri) {
    return {
      verdict: 'fail',
      error: 'file_uri required',
    };
  }
  return {
    verdict: 'pass',
    uri: `mock://drive/${args.file_uri}`,
  };
}
