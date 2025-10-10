// src/ai/tools/definitions.ts

export const TOOL_DEFINITIONS = {
  getUserCart: {
    name: "getUserCart",
    description:
      "Retrieves all cart items for a specific user, including product details, pricing, size information, stock availability, and associated categories.",
    input_schema: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description:
            "The unique identifier of the user whose cart items should be retrieved",
        },
      },
      required: ["userId"],
    },
  },

  addToCart: {
    name: "addToCart",
    description:
      "Adds a product (with a specific size) to a user's cart. If the item already exists in the cart for the same user/product/size, it validates stock and either increments the quantity or sets it to the provided amount based on your server logic (treats a higher incoming quantity as an absolute set; otherwise treats it as an incremental add). Returns success status, message, and the created cartId when applicable.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        userId: {
          type: "string",
          description: "The unique identifier of the user adding to cart.",
        },
        productId: {
          type: "string",
          description: "The unique identifier of the product to add.",
        },
        sizeId: {
          type: "string",
          description:
            "The unique identifier of the chosen product size/variant.",
        },
        quantity: {
          type: "number",
          minimum: 1,
          description:
            "Desired quantity. If the item exists and this value is greater than the current cart quantity, the server treats it as an absolute set; otherwise it adds incrementally. Stock is validated in both cases.",
        },
      },
      required: ["userId", "productId", "sizeId", "quantity"],
    },
  },

  updateCartQuantity: {
    name: "updateCartQuantity",
    description:
      "Updates the quantity of a specific cart item. Validates stock availability before updating.",
    input_schema: {
      type: "object",
      properties: {
        cartId: {
          type: "string",
          description: "The unique identifier of the cart item to update",
        },
        quantity: {
          type: "number",
          description: "The new quantity for the cart item",
        },
        userId: {
          type: "string",
          description: "The unique identifier of the user adding to cart.",
        },
      },
      required: ["cartId", "quantity", "userId"],
    },
  },

  removeFromCart: {
    name: "removeFromCart",
    description: "Removes a specific item from the user's cart by its cart ID.",
    input_schema: {
      type: "object",
      properties: {
        cartId: {
          type: "string",
          description: "The unique identifier of the cart item to remove",
        },
        userId: {
          type: "string",
          description: "The unique identifier of the user adding to cart.",
        },
      },
      required: ["cartId", "userId"],
    },
  },

  clearCart: {
    name: "clearCart",
    description: "Removes all items from a user's cart.",
    input_schema: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description:
            "The unique identifier of the user whose cart should be cleared",
        },
      },
      required: ["userId"],
    },
  },

  bulkAddCartItems: {
    name: "bulkAddCartItems",
    description:
      "Adds multiple items to a user's cart in a single operation. Automatically merges duplicate items.",
    input_schema: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "The unique identifier of the user",
        },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              productId: {
                type: "string",
                description: "The unique identifier of the product to add",
              },
              quantity: {
                type: "number",
                description: "The quantity of the product to add",
              },
              sizeId: {
                type: "string",
                description:
                  "The unique identifier of the product size/variant",
              },
            },
            required: ["productId", "quantity", "sizeId"],
          },
        },
      },
      required: ["userId", "items"],
    },
  },

  getAllProducts: {
    name: "getAllProducts",
    description:
      "Retrieves all products from the database with optional filtering and sorting capabilities.",
    input_schema: {
      type: "object",
      properties: {
        filters: {
          type: "object",
          properties: {
            isBestseller: {
              type: "boolean",
              description: "Filter to show only bestseller products",
            },
            discount: {
              type: "number",
              description: "Filter to show only products with discounts > 0",
            },
            isTrending: {
              type: "boolean",
              description: "Filter to show only trending products",
            },
            isNew: {
              type: "boolean",
              description: "Filter to show only new products",
            },
            brandSlug: {
              type: "string",
              description: "Filter products by brand slug",
            },
          },
        },
        sort: {
          type: "string",
          enum: ["trending", "latest"],
          description: "Sort order for products",
        },
      },
      required: [],
    },
  },

  getProduct: {
    name: "getProduct",
    description:
      "Retrieves a single product by its slug (URL-friendly identifier).",
    input_schema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "The unique URL-friendly identifier of the product",
        },
      },
      required: ["slug"],
    },
  },

  getUserRoutines: {
    name: "getUserRoutines",
    description:
      "Retrieves all skincare/beauty routines created by a specific user.",
    input_schema: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "The unique identifier of the user",
        },
      },
      required: ["userId"],
    },
  },

  getUserRoutine: {
    name: "getUserRoutine",
    description:
      "Retrieves a specific routine by its ID with full details including populated product information.",
    input_schema: {
      type: "object",
      properties: {
        routineId: {
          type: "string",
          description: "The unique identifier of the routine to retrieve",
        },
        userId: {
          type: "string",
          description: "The unique identifier of the user (for authorization)",
        },
      },
      required: ["routineId", "userId"],
    },
  },

  getAllBrands: {
    name: "getAllBrands",
    description:
      "Retrieves a complete list of all skincare brands available in the database. Use this when a user asks about available brands, wants to browse brands, or mentions a brand name you need to verify. Returns an array of brand objects with their details.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  getAllBrandProducts: {
    name: "getAllBrandProducts",
    description:
      "Retrieves all products from a specific brand. You can search by either the brand's slug (URL-friendly identifier like 'cerave' or 'the-ordinary') or by the brand's unique ID. Use this when a user asks about products from a specific brand (e.g., 'Show me CeraVe products', 'What does The Ordinary have for acne?'). Returns an empty array if the brand is not found or has no products.",
    input_schema: {
      type: "object",
      properties: {
        brandSlug: {
          type: "string",
          description:
            "The URL-friendly identifier (slug) of the brand. Examples: 'cerave', 'the-ordinary', 'la-roche-posay'. Prefer using this over brandId when you know the brand name.",
        },
        brandId: {
          type: "string",
          description:
            "The unique internal identifier of the brand in the database. Only use this if you have the exact brand ID from a previous query.",
        },
      },
      required: [], // Neither is required, but at least one should be provided
    },
  },
} as const;

// Export as array for Claude
export const CLAUDE_TOOLS = Object.values(TOOL_DEFINITIONS);

// Export as OpenAI format (if using OpenAI function calling)
export const OPENAI_TOOLS = CLAUDE_TOOLS.map((tool) => ({
  type: "function" as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
  },
}));
