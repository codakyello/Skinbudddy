"use client";
import { useMemo, useState } from "react";
import { notFound } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { Box } from "@chakra-ui/react";
import { useParams } from "next/navigation";

export default function Page() {
  const { token } = useParams<{ token: string }>();

  const { data, isPending } = useQuery(
    convexQuery(api.order.getOrderByToken, { token })
  );

  const order = data?.success ? data.order : null;
  const [isInit, setIsInit] = useState(false);

  const fullName = useMemo(() => {
    if (!order) return "";
    const first = order.firstName || "";
    const last = order.lastName || "";
    return `${first} ${last}`.trim();
  }, [order]);

  async function handlePay() {
    if (!order || isInit) return;
    try {
      setIsInit(true);
      const res = await fetch("/api/paystack/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order._id,
          email: order.email,
          amount: order.totalAmount,
          phone: order.phone,
          fullName,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success)
        throw new Error(json?.message || "Failed to initialize payment");
      const url = json.authorization_url as string;
      if (url) window.location.href = url;
    } catch (e) {
      console.error(e);
      alert((e as Error).message || "Payment initialization failed");
    } finally {
      setIsInit(false);
    }
  }

  if (!token) return notFound();

  if (data && "statusCode" in data && data.statusCode === 404)
    return notFound();

  return (
    <Box className="px-[2rem] md:px-[5.6rem] py-10 md:py-16 min-h-[70vh] bg-[#fafafa]">
      <Box className="max-w-[860px] mx-auto">
        <header className="mb-8 text-center">
          <h1 className="text-3xl md:text-4xl font-bold font-dmSans">
            Complete Your Payment
          </h1>
          <p className="text-gray-600 mt-2 max-w-[640px] mx-auto">
            Review your details and continue to Paystack to securely complete
            your order.
          </p>
        </header>

        {/* States */}
        {isPending && (
          <Box className="rounded-lg border p-6 bg-white shadow-sm">
            Loading order…
          </Box>
        )}

        {!isPending && (!token || !order) && (
          <Box className="rounded-lg border p-6 bg-white shadow-sm">
            <p className="text-red-600 font-medium">
              This payment link is invalid or has expired.
            </p>
          </Box>
        )}

        {!isPending && order && (
          <Box className="grid gap-6 md:grid-cols-2">
            <Box className="rounded-lg border p-6 bg-white shadow-sm">
              <h2 className="text-lg font-semibold mb-4">Billing Details</h2>
              <div className="text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Name</span>
                  <span className="font-medium">{fullName || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Email</span>
                  <span className="font-medium">{order.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Phone</span>
                  <span className="font-medium">{order.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Address</span>
                  <span className="font-medium text-right max-w-[60%]">
                    {order.address}
                    {order.streetAddress
                      ? `, ${order.streetAddress}`
                      : ""}, {order.city}, {order.state}, {order.country}
                  </span>
                </div>
              </div>
            </Box>

            <Box className="rounded-lg border p-6 bg-white shadow-sm">
              <h2 className="text-lg font-semibold mb-4">Order Summary</h2>
              <div className="text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Items</span>
                  <span className="font-medium">
                    {order.items?.length || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total</span>
                  <span className="font-semibold text-lg">
                    ₦{Number(order.totalAmount || 0).toLocaleString()}
                  </span>
                </div>
                {order.status === "paid" && (
                  <div className="text-green-600 text-sm mt-2">
                    Order already paid.
                  </div>
                )}
              </div>
              <button
                onClick={handlePay}
                disabled={isInit || order.status === "paid"}
                className={`mt-6 w-full px-5 py-3 rounded-md text-sm font-medium transition ${
                  isInit || order.status === "paid"
                    ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                    : "bg-black text-white hover:opacity-90"
                }`}
              >
                {order.status === "paid"
                  ? "Already Paid"
                  : isInit
                    ? "Redirecting…"
                    : "Pay with Paystack"}
              </button>
              <p className="text-xs text-gray-500 mt-3">
                You will be redirected to Paystack to complete your payment
                securely.
              </p>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
