"use client";

import { URL } from "../_utils/utils";

export async function authenticate(token: string | null) {
  if (!token) throw new Error("No token provided");

  const res = await fetch(`${URL}/users/authenticateUser`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },

    next: {
      revalidate: 0,
    },
  });
  if (!res.ok) throw new Error("");
  return true;
}

export async function login({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  const res = await fetch(`${URL}/users/login`, {
    method: "POST",
    body: JSON.stringify({ email, password }),
    headers: {
      "Content-Type": "application/json",
    },
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message);

  console.log(data, "data");
  const {
    data: { user, token },
  } = data;

  return { user, token };
}

export async function singUp({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  const res = await fetch(`${URL}/users/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message);

  const {
    data: { user, token },
  } = data;

  return { user, token };
}

export async function generateGuestId(guestId: string | null) {
  const res = await fetch(`${URL}/users/generateGuestId`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ guestId }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message);
  }
  const {
    data: { user },
  } = data;

  return user;
}

export const getCartSummary = async function (userId: string | undefined) {
  if (!userId) return null;

  console.log("fetching cart summary");
  const res = await fetch(`${URL}/users/${userId}/cart-summary`, {
    headers: {
      "Content-Type": "application/json",
    },
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message);

  const {
    data: { cartSummary },
  } = data;

  return cartSummary;
};

export const getUserCarts = async function (userId: string) {
  // await wait(5);
  const res = await fetch(`${URL}/users/${userId}/cart`);

  const data = await res.json();
  if (!res.ok) throw new Error(data.message);

  const {
    data: { carts },
  } = data;

  return carts;
};

export const createCartItem = async function ({
  userId,
  productId,
}: {
  userId: string;
  productId: string;
}) {
  console.log(productId, userId);

  const res = await fetch(`${URL}/users/${userId}/cart`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      product: productId,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message);

  const {
    data: { cart },
  } = data;

  return cart;
};
