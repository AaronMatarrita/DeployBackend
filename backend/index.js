import app from "./app.js";

const PORT = process.env.PORT || 4000;

async function main() {
  try {
    app.listen(PORT, () => {
      console.log(`Listening on port http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error(error);
  } 
}

main();
