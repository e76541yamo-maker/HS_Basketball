"""Offline, reproducible SportVU/PBP alignment. Python stdlib + optional py7zr."""
import argparse
import bisect
from collections import Counter, defaultdict
import csv
import hashlib
from html.parser import HTMLParser
import json
import math
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parent
GAME = '0021500438'
URLS = {
    'tracking': 'https://raw.githubusercontent.com/sealneaward/nba-movement-data/master/data/12.25.2015.CLE.at.GSW.7z',
    'pbp': f'https://raw.githubusercontent.com/sealneaward/nba-movement-data/master/data/events/{GAME}.csv',
    'box': 'https://www.basketball-reference.com/boxscores/201512250GSW.html',
}
TEAM = {1610612739: 'CLE', 1610612744: 'GSW'}

def elapsed(q, clock):
    return (q-1)*720 + 720-clock

def zone(x, y):
    d = min(math.hypot(x-5.25, y-25), math.hypot(x-88.75, y-25))
    return 'rim' if d < 8 else 'three' if d >= 23.75 or (y < 3 or y > 47) and d > 22 else 'mid'

def snapshot(m):
    return [[int(p[1]), round(p[2], 2), round(p[3], 2)] for p in m[5] if p[1] != -1]

def owner(m):
    ball = next((p for p in m[5] if p[1] == -1), None)
    ps = [p for p in m[5] if p[1] != -1]
    if not ball or len(ps) != 10 or ball[4] > 7.5:
        return None
    p = min(ps, key=lambda p: math.hypot(ball[2]-p[2], ball[3]-p[3]))
    return int(p[1]) if math.hypot(ball[2]-p[2], ball[3]-p[3]) <= 3 else None

class Box(HTMLParser):
    def __init__(self):
        super().__init__(); self.table=''; self.rows=[]; self.row={}; self.key=None
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag=='table': self.table=a.get('id','')
        if tag=='tr': self.row={}
        if tag in ('td','th'):
            self.key=a.get('data-stat'); self.row[self.key]=''
    def handle_data(self, data):
        if self.key: self.row[self.key]+=data
    def handle_endtag(self, tag):
        if tag in ('td','th'): self.key=None
        if tag=='tr' and self.table in ('box-CLE-game-basic','box-GSW-game-basic') and self.row.get('fga','').isdigit(): self.rows.append((self.table[4:7],self.row))
        if tag=='table': self.table=''

def build(raw, pbp, box_html):
    data=json.loads(raw)
    if data['gameid'] != GAME: raise ValueError('Tracking game ID mismatch')
    first=data['events'][0]
    players={str(p['playerid']): {'id':str(p['playerid']), 'name':p['firstname']+' '+p['lastname'], 'team':t['abbreviation'], 'jersey':p['jersey'], 'position':p['position']} for t in (first['visitor'],first['home']) for p in t['players']}
    frames={}
    for event in data['events']:
        for m in event['moments']:
            if len(m[5])==11 and len({p[1] for p in m[5]})==11 and 0 <= m[2] <= 720:
                frames.setdefault((m[0],round(m[2]*25)),m)
    frames=sorted(frames.values(),key=lambda m:(m[0],-m[2]))
    times=[elapsed(m[0],m[2]) for m in frames]
    events=[]; score={'CLE':0,'GSW':0}; box_counts=defaultdict(Counter)
    for row in csv.DictReader(pbp.splitlines()):
        if row['GAME_ID'] != GAME: raise ValueError('PBP game ID mismatch')
        kind=int(row['EVENTMSGTYPE']); q=int(row['PERIOD']); minute,second=map(float,row['PCTIMESTRING'].split(':')); clock=minute*60+second
        description=row['HOMEDESCRIPTION'] or row['VISITORDESCRIPTION'] or row['NEUTRALDESCRIPTION']
        pid=str(row['PLAYER1_ID']); team=row['PLAYER1_TEAM_ABBREVIATION']
        before=dict(score)
        if row['SCORE']:
            away,home=map(int,row['SCORE'].split(' - ')); score={'CLE':away,'GSW':home}
        if kind not in (1,2,3,4,5,6,13): continue
        e={'id':int(row['EVENTNUM']),'type':kind,'q':q,'clock':clock,'t':elapsed(q,clock),'player':pid if pid in players else None,'team':team if team in score else None,'scoreBefore':before,'scoreAfter':dict(score),'points':sum(score.values())-sum(before.values()),'three':'3PT' in description,'drive':any(w in description for w in ('Driving','Cutting','Running')),'steal':'STEAL' in (row['HOMEDESCRIPTION']+row['VISITORDESCRIPTION']),'matched':False}
        if kind in (1,2): box_counts[pid]['fga']+=1; box_counts[pid]['fg']+=kind==1; box_counts[pid]['pts']+=e['points']
        if kind==3: box_counts[pid]['pts']+=e['points']
        events.append(e)
    events.sort(key=lambda e:(e['t'],e['id']))
    # Infer stable control from all 25Hz samples, not event-window duplicates.
    runs=[]; active=None
    for m,t in zip(frames,times):
        pid=owner(m)
        if pid is None: continue
        if active and active['player']==str(pid) and t-active['last']<=.64 and m[0]==active['q']:
            active['last']=t; active['endFrame']=m; active['samples']+=1
        else:
            active={'player':str(pid),'q':m[0],'t':t,'last':t,'frame':m,'endFrame':m,'samples':1};runs.append(active)
    holds=[]
    for r in runs:
        if r['samples']<4 or r['last']-r['t']<.12: continue
        pid=r['player']; m=r['frame']; p=next(p for p in m[5] if str(p[1])==pid); endp=next(p for p in r['endFrame'][5] if str(p[1])==pid)
        defenders=[p2 for p2 in m[5] if p2[0] in TEAM and TEAM[p2[0]] != players[pid]['team']]
        defender=min(defenders,key=lambda d:math.hypot(p[2]-d[2],p[3]-d[3]))
        holds.append({'player':pid,'team':players[pid]['team'],'q':r['q'],'t':round(r['t'],2),'end':round(r['last'],2),'clock':round(m[2],2),'duration':round(r['last']-r['t'],2),'zone':zone(p[2],p[3]),'x':round(p[2],2),'y':round(p[3],2),'endZone':zone(endp[2],endp[3]),'defender':str(defender[1]),'distance':round(math.hypot(p[2]-defender[2],p[3]-defender[3]),2),'positions':snapshot(m),'shotClock':round(m[3],2) if m[3] is not None else None,'endKind':'reset','target':None,'event':None,'samples':r['samples']})
    # PBP records scoring after release/flight; retain the alignment offset.
    for e in events:
        if e['type'] not in (1,2,5,6): continue
        candidates=[h for h in holds if h['player']==e['player'] and h['q']==e['q'] and h['event'] is None and -.4 <= e['t']-h['end'] <= 5]
        if candidates:
            h=min(candidates,key=lambda h:abs(e['t']-h['end']));h['event']=e['id'];h['endKind']={1:'make',2:'miss',5:'turnover',6:'foul'}[e['type']];e['matched']=True;e['hold']=holds.index(h)
            if e['type'] in (1,2): e['zone']=h['endZone']; e['distance']=h['distance']
            e['alignmentOffset']=round(e['t']-h['end'],2)
    for i,h in enumerate(holds[:-1]):
        n=holds[i+1]
        boundary=any(h['end']-.01 <= e['t'] <= n['t']+.01 and e['type'] in (1,2,3,4,5,6,13) for e in events)
        if h['event'] is None and not boundary and h['q']==n['q'] and 0 <= n['t']-h['end']<=2 and h['player']!=n['player']:
            h['endKind']='pass' if h['team']==n['team'] else 'change';h['target']=n['player']
    for h in holds:
        if h['endKind']=='reset' and h['clock']-h['duration']<.3: h['endKind']='period'
    timeline=[{'kind':'hold','index':i,'t':h['t']} for i,h in enumerate(holds)]+[{'kind':'event','index':i,'t':e['t']} for i,e in enumerate(events)]
    timeline.sort(key=lambda x:(x['t'],0 if x['kind']=='event' else 1,x['index']))
    current={'CLE':0,'GSW':0}
    for item in timeline:
        item['score']=dict(current)
        if item['kind']=='event': current=events[item['index']]['scoreAfter']
    distributions={}; team_rates={}
    for team in ('CLE','GSW'):
        shots=[e for e in events if e['team']==team and e['type'] in (1,2)]
        team_rates[team]={'fga':len(shots),'fg':sum(e['type']==1 for e in shots),'fgRate':sum(e['type']==1 for e in shots)/len(shots)}
    for pid,p in players.items():
        hs=[h for h in holds if h['player']==pid];shots=[e for e in events if e['player']==pid and e['type'] in (1,2)]
        cells=defaultdict(lambda:{'n':0,'made':0});choices=defaultdict(Counter)
        for e in shots:
            if 'zone' in e:
                key=e['zone']+(':'+('tight' if e['distance']<4 else 'open' if e['distance']>=6 else 'normal'))
                cells[key]['n']+=1;cells[key]['made']+=e['type']==1
        for h in hs:
            action='pass' if h['endKind']=='pass' else 'drive' if h['endKind'] in ('make','miss') and h['endZone']=='rim' and h['zone']!='rim' else 'shoot' if h['endKind'] in ('make','miss') else 'turnover' if h['endKind']=='turnover' else 'reset'
            choices[h['zone']][action]+=1
        d={'holds':len(hs),'durations':[h['duration'] for h in hs],'targets':dict(Counter(h['target'] for h in hs if h['endKind']=='pass')),'choices':dict(choices),'shotCells':dict(cells),'fga':len(shots),'fg':sum(e['type']==1 for e in shots),'turnovers':sum(e['type']==5 for e in events if e['player']==pid),'points':box_counts[pid]['pts']}
        distributions[pid]=d
        fts=[e for e in events if e['type']==3 and e['player']==pid]
        d['fta']=len(fts);d['ftm']=sum(e['points'] for e in fts)
    parser=Box();parser.feed(box_html.replace('<!--','').replace('-->',''))
    comparisons=[]
    normalize=lambda name: name.replace('.','').replace(' ','').lower()
    for team,row in parser.rows:
        if row['player']=='Team Totals': continue
        pid=next((pid for pid,p in players.items() if normalize(p['name'])==normalize(row['player'])),None)
        actual={k:int(row[k]) for k in ('fga','fg','pts')}; observed={k:box_counts[pid][k] for k in actual}
        comparisons.append({'player':row['player'],'team':team,'box':actual,'pbp':observed,'match':actual==observed})
    if not comparisons: raise ValueError('No independent box score rows parsed')
    shots=[e for e in events if e['type'] in (1,2)]
    box_score={t:sum(p['box']['pts'] for p in comparisons if p['team']==t) for t in ('CLE','GSW')}
    validation={'frames':len(frames),'holds':len(holds),'passes':sum(h['endKind']=='pass' for h in holds),'pbpShots':len(shots),'trackingMatchedShots':sum(e['matched'] for e in shots),'trackingShotMatchRate':round(sum(e['matched'] for e in shots)/len(shots),4),'boxPlayersMatched':sum(p['match'] for p in comparisons),'boxPlayers':len(comparisons),'boxPlayerMatchRate':round(sum(p['match'] for p in comparisons)/len(comparisons),4),'finalScore':score,'boxFinalScore':box_score,'scoreMatch':score==box_score,'players':comparisons}
    return {'meta':{'gameId':GAME,'date':data['gamedate'],'teams':['CLE','GSW'],'sources':URLS,'parameters':{'radiusFeet':3,'maxHeightFeet':7.5,'minFrames':4,'bridgeSeconds':.64,'maxPassFlightSeconds':2,'pbpMatchSeconds':5,'shrinkAttempts':10},'validation':validation,'sha256':{'tracking':hashlib.sha256(raw).hexdigest(),'pbp':hashlib.sha256(pbp.encode()).hexdigest()}},'players':players,'holds':holds,'events':events,'timeline':timeline,'distributions':distributions,'teamRates':team_rates}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--download',action='store_true');args=parser.parse_args()
    folder=ROOT/'data/raw';folder.mkdir(parents=True,exist_ok=True)
    if args.download:
        for key,name in [('tracking','game.7z'),('pbp','pbp.csv'),('box','box.html')]:
            if not (folder/name).exists(): urllib.request.urlretrieve(URLS[key],folder/name)
    source=folder/f'{GAME}.json'
    if not source.exists():
        import py7zr
        with py7zr.SevenZipFile(folder/'game.7z') as archive: archive.extractall(folder)
    result=build(source.read_bytes(),(folder/'pbp.csv').read_text(),(folder/'box.html').read_text())
    (ROOT/'src/tracking-game.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
    (ROOT/'data/validation.json').write_text(json.dumps(result['meta']['validation'],ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result['meta']['validation'].items() if k!='players'},indent=2))

if __name__=='__main__':main()
