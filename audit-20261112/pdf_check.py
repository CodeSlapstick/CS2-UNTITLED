import json
from pathlib import Path
import pymupdf

root=Path(__file__).resolve().parent
files=[]
for file in root.glob('*.pdf'):
    doc=pymupdf.open(file)
    pages=[]
    for i,page in enumerate(doc):
        pages.append({'page':i+1,'width':page.rect.width,'height':page.rect.height,
                      'text_chars':len(page.get_text()),'images':len(page.get_images())})
        if i in (0,3):
            page.get_pixmap(matrix=pymupdf.Matrix(1.3,1.3)).save(root/f'{file.stem}-page{i+1}.png')
    files.append({'file':str(file),'pages':pages,'is_pdf':doc.is_pdf,'encrypted':doc.is_encrypted})
(root/'pdf-validation.json').write_text(json.dumps(files,indent=2),encoding='utf-8')
print(json.dumps(files,indent=2))
