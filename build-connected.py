from pathlib import Path
import base64,hashlib,re
root=Path(__file__).resolve().parent/'DGJ-CRM-connected'
html=(root/'index.html').read_text()
def script(match):
    source='\n'+(root/match.group(1)).read_text().replace('</script','<\\/script')+'\n'
    return '<script>'+source+'</script>'
html=re.sub(r'<script src="([^"]+)"></script>',script,html)
html=re.sub(r'<link rel="stylesheet" href="([^"]+)">',lambda m:'<style>\n'+(root/m.group(1)).read_text()+'\n</style>',html)
for path in (root/'assets').glob('*.png'):
    html=html.replace('assets/'+path.name,'data:image/png;base64,'+base64.b64encode(path.read_bytes()).decode())
hashes=["'sha256-"+base64.b64encode(hashlib.sha256(m.group(1).encode()).digest()).decode()+"'" for m in re.finditer(r'<script>(.*?)</script>',html,re.S)]
csp="default-src 'none'; script-src "+' '.join(hashes)+"; style-src 'unsafe-inline'; img-src data:; connect-src https://dgj-crm-backend-production.up.railway.app; base-uri 'none'; form-action 'none'; object-src 'none'"
html=html.replace('<meta charset="utf-8">','<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="'+csp+'">',1)
(root/'dist').mkdir(exist_ok=True)
(root/'dist/index.html').write_text(html)
print('Built self-contained index.html:',len(html.encode()),'bytes;',len(hashes),'script hashes')
