import json,urllib.request,time
B="https://store.kampi.co.za/wp-json/wc/store/v1/"
def get(u):
    for i in range(3):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(B+u,headers={'User-Agent':'nk-catalogue/1'}),timeout=30))
        except Exception as e: err=e; time.sleep(2)
    raise err
prods=get("products?per_page=100")
out=[]
for p in prods:
    v=[]
    if p['type']=='variable':
        v=get(f"products?type=variation&parent={p['id']}&per_page=100")
    p['_variations']=v
    out.append(p)
json.dump(out,open(__import__('sys').argv[1] if len(__import__('sys').argv)>1 else 'kampi-full.json','w'),indent=1)
print(len(out),sum(len(p['_variations']) for p in out))
for p in out:
    if p['type']=='variable': print(p['id'],p['name'][:40],len(p['variations']),len(p['_variations']))

cats = get("products/categories?per_page=100")
json.dump(cats, open((__import__("sys").argv[1] if len(__import__("sys").argv) > 1 else "kampi-full.json").replace(".json", "-categories.json"), "w"), indent=1)
