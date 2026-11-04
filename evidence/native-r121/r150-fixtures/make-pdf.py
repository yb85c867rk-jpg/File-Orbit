from pathlib import Path
import json, hashlib

def pdf_bytes():
    objs = []
    objs.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objs.append(b"<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>")
    objs.append(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>")
    content1 = b"BT\n/F1 24 Tf\n72 720 Td\n(FILEORBIT PDF PAGE ONE - recognizable synthetic content) Tj\n0 -36 Td\n/F1 14 Tf\n(Alpha page text: 300-node lifecycle preview.) Tj\nET\n"
    content2 = b"BT\n/F1 24 Tf\n72 720 Td\n(FILEORBIT PDF PAGE TWO - second page content) Tj\n0 -36 Td\n/F1 14 Tf\n(Beta page text: page navigation target.) Tj\nET\n"
    objs.append(b"<< /Length " + str(len(content1)).encode() + b" >>\nstream\n" + content1 + b"endstream")
    objs.append(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>")
    objs.append(b"<< /Length " + str(len(content2)).encode() + b" >>\nstream\n" + content2 + b"endstream")
    objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for i, obj in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs)+1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets[1:]:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)

pdf = pdf_bytes()
p = Path('evidence/native-r121/r150-fixtures/report-r150.pdf')
p.write_bytes(pdf)
print(json.dumps({'path': str(p), 'bytes': len(pdf), 'sha256': hashlib.sha256(pdf).hexdigest()}, indent=2))
