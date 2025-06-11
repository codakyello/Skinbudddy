const brands = [
  "Acwell",
  "Advanced Clinicals",
  "COSRX",
  "Cerave",
  "Dove",
  "Isntree",
  "Skin Aqua",
  "Klairs",
  "Kojie San",
  "La Roche Posay",
  "Laneige",
  "MEDICUBE",
  "Medix",
  "Missha",
  "Nature Bounty",
  "Naturium",
  "Neutrogena",
  "NINELESS",
  "Panoxyl",
  "Replenix",
  "Simple Skincare",
  "Tiam",
  "Timeless Skincare",
  "Vaseline",
  "Eucerin",
];

brands.forEach(async (brand) => {
  console.log(brand);
  try {
    const res = await fetch(`http://localhost:5000/api/v1/brands`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4MzA5MGQ2YzNlMzI3NzczMDdlYTBhOSIsImlhdCI6MTc0ODAxMzI3MCwiZXhwIjoxNzUwNjA1MjcwfQ.0BQZKVQ7l9ZOn2TJZEFbt31g0cvxLBto0eK9n7TY4-w`,
      },
      body: JSON.stringify({ name: brand }),
    });
    const data = await res.json();
    console.log(data);
  } catch (err) {
    console.log(err);
  }
});
