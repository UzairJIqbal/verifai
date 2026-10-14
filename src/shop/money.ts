// Money is whole rupees in integers everywhere; this is the one place it becomes text.
export function formatRupees(amount: number): string {
  return `Rs ${amount.toLocaleString("en-US")}`;
}
