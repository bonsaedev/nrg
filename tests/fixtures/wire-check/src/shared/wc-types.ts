// Shared data types for the wire-check demo nodes.
//
// A node's INPUT `Port<T>` names the fields it READS off the accumulating
// record; an OUTPUT `Port<T>` names the fields it ADDS. For a wire to pass, every
// field the target reads must be present on the record — with a matching shape —
// by the time the message arrives (added by this node or one further upstream).

interface Order {
  id: string;
  total: number;
}

interface Customer {
  id: string;
  name: string;
}

export type { Order, Customer };
