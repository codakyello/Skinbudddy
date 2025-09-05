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
    <Box className="px-[2rem] md:px-[5.6rem] py-10 md:py-16 min-h-[70vh] bg-gray-50">
      <Box className="max-w-[860px] mx-auto bg-white p-8 rounded-xl shadow-lg">
        <header className="mb-10 text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold font-dmSans text-gray-900 leading-tight">
            {fullName} is requesting you to pay for their order
          </h1>
          <p className="text-gray-600 mt-4 max-w-[700px] mx-auto text-lg">
            Review your details and continue to Paystack to securely complete
            your order.
          </p>
        </header>

        {/* States */}
        {isPending && (
          <Box className="rounded-lg border border-gray-200 p-8 bg-white shadow-md text-center text-gray-700 text-lg">
            Loading order…
          </Box>
        )}

        {!isPending && (!token || !order) && (
          <Box className="rounded-lg border border-red-300 p-8 bg-red-50 shadow-md text-center text-red-700 text-lg">
            <p className="font-semibold">
              This payment link is invalid or has expired.
            </p>
          </Box>
        )}

        {!isPending && order && (
          <Box className="grid gap-8 md:grid-cols-2 mt-8">
            <Box className="rounded-xl border border-gray-200 p-8 bg-white shadow-md">
              <h2 className="text-2xl font-semibold mb-6 text-gray-800">
                Billing Details
              </h2>
              <div className="text-base space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                  <span className="text-gray-600">Name</span>
                  <span className="font-medium text-gray-900">
                    {fullName || "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                  <span className="text-gray-600">Email</span>
                  <span className="font-medium text-gray-900">
                    {order.email}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                  <span className="text-gray-600">Phone</span>
                  <span className="font-medium text-gray-900">
                    {order.phone}
                  </span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-gray-600">Address</span>
                  <span className="font-medium text-right max-w-[60%] text-gray-900">
                    {order.address}
                    {order.streetAddress
                      ? `, ${order.streetAddress}`
                      : ""}, {order.city}, {order.state}, {order.country}
                  </span>
                </div>
              </div>
            </Box>

            <Box className="rounded-xl border border-gray-200 p-8 bg-white shadow-md">
              <h2 className="text-2xl font-semibold mb-6 text-gray-800">
                Order Summary
              </h2>
              <div className="text-base space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                  <span className="text-gray-600">Items</span>
                  <span className="font-medium text-gray-900">
                    {order.items?.length || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Total</span>
                  <span className="font-bold text-3xl text-gray-900">
                    ₦{Number(order.totalAmount || 0).toLocaleString()}
                  </span>
                </div>
                {order.status === "paid" && (
                  <div className="text-green-600 text-base mt-4 p-3 bg-green-50 rounded-md border border-green-300">
                    Order already paid.
                  </div>
                )}
              </div>
              <button
                onClick={handlePay}
                disabled={isInit || order.status === "paid"}
                className={`mt-8 w-full px-6 py-4 rounded-xl text-lg font-bold transition duration-300 ease-in-out ${
                  isInit || order.status === "paid"
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                    : "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg hover:from-purple-700 hover:to-indigo-700 transform hover:-translate-y-1"
                }`}
              >
                {order.status === "paid"
                  ? "Already Paid"
                  : isInit
                    ? "Redirecting…"
                    : "Pay with Paystack"}
              </button>
              <p className="text-sm text-gray-500 mt-4 text-center">
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
