from PIL import Image
import cv2
import numpy as np

img_path = "12.jpg"
img = cv2.imread(img_path)

# Approximate watermark region in lower-left area
mask = np.zeros(img.shape[:2], dtype=np.uint8)
h, w = mask.shape

# Rectangle covering the visible text watermark
cv2.rectangle(mask, (90, 1180), (520, 1275), 255, -1)

# Inpaint
result = cv2.inpaint(img, mask, 7, cv2.INPAINT_TELEA)

out_path = "edited_no_text.jpg"
cv2.imwrite(out_path, result)

print(out_path)
