import app from "./app.js";

const PORT = process.env.PORT || 4000;

async function main() {
  try {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error(error);
  } 
}

main();