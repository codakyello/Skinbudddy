//  const handleAddToCart = async () => {
//     try {
//       setIsAdding(true);
//       console.log(user, "This is the user");

//       if (!user.id) return;

//       const res = await addToCart({
//         sizeId: selectedSize?.id,
//         userId: user.id,
//         productId: product._id as Id<"products">,
//         quantity,
//       });

//       if (!res?.success) throw new AppError(res?.message as string);

//       toast.success(`Added to cart`);
//       // open the cart modal for confirmation
//       open("cart");
//     } catch (error) {
//       if (error instanceof AppError) toast.error(error.message);
//       else {
//         toast.error("An unknown error occured");
//       }
//     } finally {
//       setIsAdding(false);
//     }
//   };
