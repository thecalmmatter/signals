// Single source of truth for the regulatory disclaimer shown across every
// customer-facing surface — landing page, dashboard, track record, signal
// modal, waitlist, launch page, and the Telegram lead bot. Critical: this
// app publishes real entry/target/stop calls on real listed stocks, which
// is exactly the kind of content SEBI's Research Analyst / Investment
// Adviser regulations govern. Getting this wrong (or leaving it off pages
// that show live calls) is a compliance risk, not just a copy nitpick —
// this file exists so the wording only has to be gotten right once, and
// every surface stays consistent with it.
//
// IMPORTANT: this is NOT legal advice, and I'm not a lawyer. The wording
// below is a reasonable-effort plain-English disclaimer, not something
// verified against SEBI's actual RA/IA regulations by counsel. Get this
// reviewed by a securities lawyer before relying on it — especially before
// charging money for access (BILLING_ENABLED) or onboarding a second
// tenant, since a paid product carries more regulatory scrutiny than a
// free public dry run.
//
// A tenant with sebi_reg_name/sebi_reg_number set (scripts/migration_tenants.sql)
// is asserting they ARE a registered Research Analyst/Investment Adviser —
// that's an operator-entered fact, not something this code verifies, so
// only wire those columns up for a tenant whose registration you've
// actually confirmed yourself.

export type DisclaimerTenant = {
  brandName: string;
  sebiRegName: string | null;
  sebiRegNumber: string | null;
};

/** Full-length disclaimer for a prominent banner (dashboard, track record). */
export function disclaimerBannerText(tenant: DisclaimerTenant): string {
  if (tenant.sebiRegName && tenant.sebiRegNumber) {
    return (
      `Research provided by ${tenant.sebiRegName} (SEBI Reg. No. ${tenant.sebiRegNumber}). ` +
      `For educational and informational purposes only — this is not personalized investment ` +
      `advice, and nothing here is a solicitation to buy or sell any security. Trade at your ` +
      `own discretion and risk.`
    );
  }
  return (
    `For educational and informational purposes only. Nothing on this page is a buy/sell ` +
    `recommendation or personalized investment advice — it's a technical setup format, ` +
    `published for learning and discussion. ${tenant.brandName} is not registered with ` +
    `SEBI as an Investment Adviser or Research Analyst. Trade at your own discretion and risk.`
  );
}

/** Short one-line version for a footer strip (landing/waitlist/launch pages). */
export function disclaimerFooterText(tenant: DisclaimerTenant): string {
  if (tenant.sebiRegName && tenant.sebiRegNumber) {
    return `${tenant.brandName} — research by ${tenant.sebiRegName} (SEBI Reg. No. ${tenant.sebiRegNumber}). Educational purposes only, not personalized investment advice.`;
  }
  return `${tenant.brandName} — educational purposes only. Not a buy/sell recommendation, not personalized investment advice. Not SEBI-registered as an Investment Adviser or Research Analyst.`;
}

/** Fallback used by pages with no tenant context yet (marketing pages that
 *  aren't rendered for a specific signed-in customer). Mirrors the default
 *  tenant's un-registered state — correct for the single-operator instance
 *  today; revisit if the operator itself becomes SEBI-registered. */
export const DEFAULT_DISCLAIMER_TENANT: DisclaimerTenant = {
  brandName: "Signals",
  sebiRegName: null,
  sebiRegNumber: null,
};
