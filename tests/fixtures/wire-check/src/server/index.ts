import WcSource from "./nodes/wc-source";
import WcEnrich from "./nodes/wc-enrich";
import WcInvoice from "./nodes/wc-invoice";
import WcBadSource from "./nodes/wc-bad-source";
import WcUntyped from "./nodes/wc-untyped";
import WcClear from "./nodes/wc-clear";
import WcAudit from "./nodes/wc-audit";
import WcShip from "./nodes/wc-ship";
import WcFull from "./nodes/wc-full";

export default {
  nodes: [
    WcSource,
    WcEnrich,
    WcInvoice,
    WcBadSource,
    WcUntyped,
    WcClear,
    WcAudit,
    WcShip,
    WcFull,
  ],
};
