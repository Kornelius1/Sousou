// Bible dialog (button #tb-bible). The code lives in ./bible/ (see dialog.js).
import { openBible } from "./bible/dialog.js";

export { chunkVerses, buildItems } from "./bible/slides.js";
export { openBible };

document.addEventListener("click", (e) => {
  if (e.target.closest?.("#tb-bible")) openBible();
});