export function slugify(input: string, options?: { lower?: boolean; strict?: boolean }): string {
    const { lower = true, strict = true } = options || {};
  
    let slug = input
      .normalize("NFD")                   // decompose accents → "é" → "e" + "́"
      .replace(/[\u0300-\u036f]/g, "");   // remove diacritics
  
    // Replace non-alphanumeric with dashes
    slug = slug.replace(/[^a-zA-Z0-9]+/g, "-");
  
    // Trim leading/trailing dashes
    slug = slug.replace(/^-+|-+$/g, "");
  
    // Convert to lowercase if needed
    if (lower) slug = slug.toLowerCase();
  
    // Strict mode: only keep URL-safe characters
    if (strict) slug = slug.replace(/[^a-z0-9\-]/g, "");
  
    return slug;
  }