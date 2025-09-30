import { Box } from "@chakra-ui/react";
import { toast } from "sonner";
import AppError from "../_utils/appError";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "../_contexts/CreateConvexUser";
import useUserCart from "../_hooks/useUserCart";
import { api } from "@/convex/_generated/api";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Id } from "@/convex/_generated/dataModel";
import { ModalWindow, useModal } from "./Modal";
import { FormError, Product, User } from "../_utils/types";
import {
  hasCategory,
  hasRoutineCategory,
  validateEmail,
  validatePhoneNo,
} from "../_utils/utils";
import { FormRow } from "./FormRow";
import { RoutineSuggestionsModal } from "./RoutineSuggestionsModal";
import CheckBox from "./CheckBox";

export function CheckoutForm({ userDetail }: { userDetail: User }) {
  const createOrder = useMutation(api.order.createOrder);
  const [isInitiating, setIsInitiating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const { user } = useUser();
  const { cart } = useUserCart(user._id as string);
  const [errors, setErrors] = useState<FormError>({});
  const selectedProductIds = useMemo(() => {
    return (cart || [])
      .map((item) => item.product?._id)
      .filter(Boolean) as Id<"products">[];
  }, [cart]);
  const [skipped, SetSkipped] = useState(false);
  const [input, setInput] = useState({
    firstName: "",
    lastName: "",
    companyName: "",
    country: "",
    streetAddress: "",
    additionalAddress: "",
    state: "",
    city: "",
    phone: "",
    email: "",
  });
  useEffect(() => {
    if (!userDetail) return;
    setInput((prev) => {
      const next = { ...prev };
      (Object.keys(prev) as Array<keyof typeof prev>).forEach((k) => {
        const val = (userDetail as Record<string, unknown>)[k as string];
        if (val !== undefined && val !== null) {
          next[k] = String(val);
        }
      });
      return next;
    });
  }, [userDetail]);

  const [checked, setChecked] = useState(false);
  const { open } = useModal();
  const essentials = useQuery(api.products.getEssentialProducts, {
    selectedProductIds,
    perCategory: 10,
    // fragranceFree: true, // uncomment if you want to force FF
  });
  const products = cart
    .map((item) => item.product)
    .filter(Boolean) as Product[];
  if (cart.length < 1) return;

  const anyProductCanBeInRoutine = cart.some(
    (item) => item.product?.canBeInRoutine
  );

  const hasCoreProducts = ["moisturiser", "cleanser", "sunscreen"].every(
    (cat) => hasCategory(products, cat)
  );

  // check if products have all the core categories and if they can be added in a routine
  const allCoreProductCanBeInRoutine = [
    "moisturiser",
    "cleanser",
    "sunscreen",
  ].every((cat) => hasRoutineCategory(products, cat));

  const hasSuggestions =
    essentials &&
    Object.values(essentials).some(
      (list) => Array.isArray(list) && list.length > 0
    );

  function handleCheck(e: ChangeEvent<HTMLInputElement>) {
    const value = e.currentTarget.checked;
    setChecked(value);
    console.log(value);
  }

  // sync default values to controlled input

  const anyInput = input as Record<string, string>;
  const safeTrim = (v: unknown) =>
    (typeof v === "string" ? v : String(v ?? "")).trim();

  const firstName = safeTrim(anyInput.firstName);
  const lastName = safeTrim(anyInput.lastName);
  const email = safeTrim(anyInput.email);
  const phone = safeTrim(anyInput.phone);
  const country = safeTrim(anyInput.country);
  const stateVal = safeTrim(anyInput.state);
  const city = safeTrim(anyInput.city);
  const streetAddress = safeTrim(anyInput.streetAddress);
  const additionalAddress = safeTrim(anyInput.additionalAddress);
  const companyName = safeTrim(anyInput.companyName);
  const fullAddress = [streetAddress, additionalAddress]
    .filter(Boolean)
    .join(", ");

  //   const skipped = false;
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // we can get the name of the input and do what we want to do in one function
    const inputName = event.currentTarget.name;
    const inputValue = event.currentTarget.value;

    // controlled input
    setInput((prevInputs) => ({ ...prevInputs, [inputName]: inputValue }));

    // Use a simple validator map keyed by input name
    const validators: Record<string, (v: string) => string | null | undefined> =
      {
        email: validateEmail,
        phone: validatePhoneNo,
      };

    const validate = validators[inputName];
    let errorMsg = validate ? validate(inputValue) : undefined;

    // Trick to get latest state
    setInput((prevState) => {
      if (!prevState.firstName && inputName === "firstName")
        errorMsg = "First name is required";
      if (!prevState.lastName && inputName === "lastName")
        errorMsg = "Last name is required";
      if (!prevState.country && inputName === "country")
        errorMsg = "Country/region is required";
      if (!prevState.state && inputName === "state")
        errorMsg = "State is required";
      if (!prevState.city && inputName === "city")
        errorMsg = "City is required";
      if (!prevState.streetAddress && inputName === "streetAddress")
        errorMsg = "Street address is required";

      setErrors((prev) => ({
        ...prev,
        [inputName]: errorMsg ?? "",
      }));
      return prevState;
    });
  };

  const handleSkip = function () {
    // set state for downstream UI, but also pass an immediate override
    SetSkipped(true);
    handleOrder(undefined, true);
  };

  const handleOrder = async function (
    e?: React.FormEvent<HTMLFormElement>,
    forceSkip: boolean = false
  ) {
    console.log("ordering");
    e?.preventDefault();
    console.log("handle order");

    // ---- Validate required fields ----
    const newErrors: FormError = {};

    console.log(streetAddress, "this is street address");

    if (!firstName) newErrors.firstName = "First name is required";
    if (!lastName) newErrors.lastName = "Last name is required";
    const emailErr = validateEmail(email);
    if (emailErr) newErrors.email = emailErr;
    const phoneErr = validatePhoneNo(phone);
    if (phoneErr) newErrors.phone = phoneErr;
    if (!country) newErrors.country = "Country/region is required";
    if (!stateVal) newErrors.state = "State is required";
    if (!city) newErrors.city = "City is required";
    if (!streetAddress) newErrors.streetAddress = "Street address is required";

    // If we have new validation errors, surface them and stop

    if (Object.keys(newErrors).length > 0) {
      setErrors((prev) => ({ ...prev, ...newErrors }));
      toast.error("Please fix the highlighted fields");
      return null;
    }

    // Also stop if an existing error remains (paranoia check)
    if (Object.values(errors).some(Boolean)) return null;

    // ---- Cart checks & routine suggestions logic ----

    console.log(allCoreProductCanBeInRoutine, "All core products");
    if (
      anyProductCanBeInRoutine &&
      !allCoreProductCanBeInRoutine &&
      !(skipped || forceSkip) &&
      hasSuggestions
    ) {
      open("routine-suggestions");
      console.log("recommend: essentials not ready or none available");
      return null; // pause checkout while user considers suggestions
    }

    // ---- Proceed with order creation & payment ----
    try {
      setIsInitiating(true);
      const res = await createOrder({
        userId: user._id as string,
        email,
        phone,
        address: fullAddress || streetAddress,
        city,
        state: stateVal,
        country: "Nigeria",
        firstName,
        lastName,
        companyName,
        additionalAddress, // additional address
        streetAddress, // keep separate fields for backend if needed
        deliveryNote: "",
        createRoutine: checked,
      });

      console.log(fullAddress);

      const orderId = res?.orderId;
      if (!res.success) throw new AppError(res.message as string);
      if (!orderId) throw new AppError("Order ID not found after creation");

      const totalAmount = cart.reduce(
        (acc, item) => (item.product?.price ?? 0) * (item.quantity ?? 0) + acc,
        0
      );

      const paystackRes = await fetch("/api/paystack/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          userId: user._id,
          email,
          amount: totalAmount,
          phone: phone.replace(/^\+?/, ""), // basic normalization
          fullName: `${firstName} ${lastName}`.trim(),
        }),
      });

      const paystackData = await paystackRes.json();

      if (!paystackRes.ok || !paystackData.success) {
        throw new AppError(
          paystackData.message || "Failed to initiate Paystack payment"
        );
      }

      window.location.href = paystackData.authorization_url;
      toast.success("order created successfully");
      return null;
    } catch (err) {
      console.log(err);
      if (err instanceof AppError) toast.error(err.message);
      else toast.error("Something went wrong");
      return null;
    } finally {
      setIsInitiating(false);
    }
  };

  const handleGenerateOrderToken = async function () {
    const newErrors: FormError = {};

    if (!firstName) newErrors.firstName = "First name is required";
    if (!lastName) newErrors.lastName = "Last name is required";
    const emailErr = validateEmail(email);
    if (emailErr) newErrors.email = emailErr;
    const phoneErr = validatePhoneNo(phone);
    if (phoneErr) newErrors.phone = phoneErr;
    if (!country) newErrors.country = "Country/region is required";
    if (!stateVal) newErrors.state = "State is required";
    if (!city) newErrors.city = "City is required";
    if (!streetAddress) newErrors.streetAddress = "Street address is required";

    if (Object.keys(newErrors).length > 0) {
      setErrors((prev) => ({ ...prev, ...newErrors }));
      return toast.error("Please fix the highlighted fields");
    }

    try {
      setIsGenerating(true);
      const res = await createOrder({
        userId: user._id as string,
        orderType: "pay_for_me",
        email,
        phone,
        address: fullAddress || streetAddress,
        city,
        state: stateVal,
        country: "Nigeria",
        firstName,
        lastName,
        companyName,
        additionalAddress,
        streetAddress, // keep separate fields for backend if needed
        deliveryNote: "",
        createRoutine: checked,
      });

      console.log(fullAddress, "full Address");

      if (!res.success) throw new AppError(res.message);

      toast.success("Token generated successfully");

      // Build a shareable URL from the returned token and show it to the user
      if (!res.token) throw new AppError("Token was not returned");

      const shareUrl = `${window.location.origin}/pay/${res.token}`;

      // Attempt to copy to clipboard for convenience
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Link copied to clipboard");
      } catch {
        // Fallback: ignore clipboard errors and continue to prompt
      }

      // Show a prompt so the user can see/copy the link even if clipboard fails
      window.prompt(
        "Shareable payment link (press ⌘/Ctrl+C to copy)",
        shareUrl
      );
    } catch (err) {
      if (err instanceof AppError) toast.error(err.message);
      // else if (err instanceof Error) toast.error(err.message);
      else toast.error("Something went wrong");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <p className="text-[1.3rem] text-[#777]">
        Returning Customer?{" "}
        <span className="text-[#444]">Click Here to Login</span>
      </p>
      <p className="uppercase border-b border-gray-200 pt-[2rem] pb-[1.2rem] text-[1.4rem] font-semibold">
        billing information
      </p>

      {/* implement control input so other buttons can call handleOrder and pass in
      the form arguments too */}
      <form className="mt-[2rem] flex flex-col" onSubmit={handleOrder}>
        <Box className="grid grid-cols-2 gap-[2rem] items-center">
          <Box>
            <FormRow
              defaultValue={userDetail?.firstName}
              name="firstName"
              label="First name"
              onInputChange={handleInputChange}
              error={errors.firstName || ""}
            />
          </Box>

          <FormRow
            defaultValue={userDetail?.lastName}
            name="lastName"
            label="Last name"
            onInputChange={handleInputChange}
            error={errors.lastName || ""}
          />
        </Box>

        <FormRow
          defaultValue={userDetail?.companyName}
          name="companyName"
          label="Company name (optional)"
          required={false}
          onInputChange={handleInputChange}
          error={errors.companyName || ""}
        />

        <FormRow
          defaultValue={userDetail?.country}
          name="country"
          label="Country/region"
          onInputChange={handleInputChange}
          error={errors.country || ""}
        />

        <FormRow
          defaultValue={userDetail?.streetAddress}
          name="streetAddress"
          label="street address"
          onInputChange={handleInputChange}
          error={errors.streetAddress || ""}
        />

        <FormRow
          defaultValue={userDetail?.additionalAddress}
          name="additionalAddress"
          required={false}
          onInputChange={handleInputChange}
        />

        <FormRow
          defaultValue={userDetail?.state}
          name="state"
          label="state"
          onInputChange={handleInputChange}
          error={errors.state || ""}
        />

        <FormRow
          defaultValue={userDetail?.city}
          name="city"
          label="city"
          onInputChange={handleInputChange}
          error={errors.city || ""}
        />

        <FormRow
          defaultValue={userDetail?.phone}
          name="phone"
          label="phone"
          onInputChange={handleInputChange}
          error={errors.phone || ""}
        />

        <FormRow
          defaultValue={userDetail?.email}
          name="email"
          inputType="email"
          label="email address"
          onInputChange={handleInputChange}
          error={errors.email || ""}
        />

        {hasCoreProducts && allCoreProductCanBeInRoutine && (
          <Box className="flex gap-3 mb-[3rem] mt-[-1rem] items-center">
            <CheckBox
              className="!h-[16px]"
              id="create-routine"
              name="createRoutine"
              onChange={handleCheck}
            />
            <label htmlFor="create-routine">
              Do you want us to help you create a routine?
            </label>
          </Box>
        )}

        <Box className="flex gap-[2rem]">
          <button
            disabled={isInitiating}
            className="text-[1.1rem] uppercase mb-[2rem] font-semibold  bg-black text-white px-[1.5rem] py-[1.2rem]"
            type="submit"
          >
            {isInitiating ? "...Loading" : "Place Order"}
          </button>
          <button
            disabled={isGenerating}
            onClick={handleGenerateOrderToken}
            className="text-[1.1rem] uppercase mb-[2rem] font-semibold  bg-black text-white px-[1.5rem] py-[1.2rem]"
            type="button"
          >
            {isGenerating ? "...Generating" : "Generate Payment Link"}
          </button>
        </Box>
      </form>
      <ModalWindow
        bgClassName="bg-black/25 z-[9999]"
        name="routine-suggestions"
        position="center"
        listenCapturing={false}
      >
        <RoutineSuggestionsModal handleSkip={handleSkip} />
      </ModalWindow>
    </>
  );
}
