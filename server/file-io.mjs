import fs from "node:fs/promises";
export async function replaceFile(source, destination) {
  // Windows readers and antivirus scanners can briefly lock a destination.
  // Keep replacement atomic: never delete the previous file to work around it.
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(source, destination);
      return;
    } catch (e) {
      if (!["EPERM", "EACCES", "EBUSY"].includes(e.code) || attempt >= 6)
        throw e;
      await new Promise((resolve) => setTimeout(resolve, 20 * 2 ** attempt));
    }
  }
}
