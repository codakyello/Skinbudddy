import { Box } from "@chakra-ui/react";

export default function Page({ params }: { params: { name: string } }) {
  console.log(params.name);

  return (
    <Box>
      <h1>Product Page</h1>
      <h2>{params.name}</h2>
      <p>Product details will be displayed here.</p>
    </Box>
  );
}
