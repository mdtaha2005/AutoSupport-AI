import re
from typing import List

# Negations and domain-critical tokens to preserve
PRESERVE_TOKENS = {
    "not", "no", "never", "none", "neither", "nor", "can't", "cannot",
    "won't", "don't", "didn't", "isn't", "aren't", "wasn't", "weren't",
    "hasn't", "haven't", "hadn't", "shouldn't", "wouldn't", "couldn't"
}

class TextNormalizer:
    def __init__(self):
        # Compiled regex patterns for speed
        self.html_pattern = re.compile(r"<[^>]+>")
        self.url_pattern = re.compile(r"https?://\S+|www\.\S+")
        self.email_pattern = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b")
        self.multiple_spaces = re.compile(r"\s+")
        self.special_chars = re.compile(r"[^\w\s\$\€\£\¥\#\-\.\@\:\/]")

    def normalize(self, text: str) -> str:
        """
        Cleans and normalizes customer input while preserving entity markers
        like currency symbols, hashes, hyphens, and negative sentiment tokens.
        """
        if not text:
            return ""

        # 1. Remove HTML tags
        cleaned = self.html_pattern.sub(" ", text)

        # 2. Standardize URLs and Emails while preserving structure
        cleaned = self.url_pattern.sub(" ", cleaned)
        
        # 3. Handle common contractions
        contractions = {
            r"\bcan't\b": "cannot",
            r"\bwon't\b": "will not",
            r"\bn't\b": " not",
            r"\b've\b": " have",
            r"\b're\b": " are",
            r"\b'd\b": " would",
            r"\b'll\b": " will",
            r"\b'm\b": " am",
        }
        for pattern, replacement in contractions.items():
            cleaned = re.sub(pattern, replacement, cleaned, flags=re.IGNORECASE)

        # 4. Remove unhelpful punctuation while preserving currency and entity characters
        cleaned = self.special_chars.sub(" ", cleaned)

        # 5. Normalize whitespace
        cleaned = self.multiple_spaces.sub(" ", cleaned).strip()

        return cleaned

    def tokenize_and_clean(self, text: str) -> List[str]:
        """
        Splits text into cleaned lowercase tokens, keeping essential stopwords.
        """
        normalized = self.normalize(text)
        tokens = normalized.lower().split()
        return tokens

normalizer = TextNormalizer()
