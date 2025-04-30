"use server";

import { RESULTS_PER_PAGE } from "../_utils/const";
import { URL } from "../_utils/utils";
// import { wait } from "../_utils/utils";
// import { catchAsync } from "../utils";

// if we dont need client side fetching
// INclude all server side get request and all mutations for them.
//Here we can't throw errors
// Data that is not needed to be refetched becuase changes are rarely made

// const DEV_URL = "http://localhost:5000/api/v1";

export const getAllProducts = async function (searchParams: {
  page: number;
  limit: number;
  sortBy: string;
}) {
  const page = searchParams.page || 1;
  // const status = searchParams.status;
  const sort = searchParams.sortBy;
  const limit = searchParams.limit || RESULTS_PER_PAGE;

  // console.log(searchParams);

  let query = "";
  // Page
  query += `?page=${page}&limit=${limit}`;

  // Filter
  // if (status && status !== "all") query += `&status=${status}`;

  // Sort, highest participant,
  switch (sort) {
    case "best-seller":
      query += "&sort=-totalSold";
      break;
    case "startDate-asc":
      query += "&sort=startDate";
      break;
    case "participants-desc":
      query += "&sort=-participantCount";
      break;
    case "participants-asc":
      query += "&sort=participantCount";
      break;
    default:
      query += "&sort=-createdAt";
  }

  try {
    const res = await fetch(`${URL}/products${query}`, {
      next: {
        revalidate: 0,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message);
    }

    const {
      data: { products },
    } = data;

    return products;
  } catch (err) {
    if (err instanceof Error) {
      console.error(err.message);
    }
  }
};

export const getAnnouncements = async function () {
  try {
    const res = await fetch(`${URL}/announcements`, {
      next: {
        revalidate: 0,
      },
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.message);

    const {
      data: { announcements },
    } = data;

    return announcements;
  } catch (err) {
    if (err instanceof Error) {
      console.log(err);
    }
  }
};
