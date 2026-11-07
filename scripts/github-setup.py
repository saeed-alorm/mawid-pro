#!/usr/bin/env python3
"""Idempotent account operations missing from the current connector.
Uses the caller's existing gh login; never reads, invents or prints credentials.
Run audit first. No billing/visibility/ownership changes or automatic merge.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OWNER = 'saeed-alorm'
WEB = f'{OWNER}/mawid-pro'
MOBILE = f'{OWNER}/mawid-mobile'
TITLE = 'MAWID Engineering'
STATUSES = ['Backlog','Ready','In progress','Review','Ready to release','Done']

def run(args, *, stdin=None, check=True, cwd=None):
    result = subprocess.run(args, input=stdin, text=True, capture_output=True, cwd=cwd)
    if check and result.returncode:
        # gh errors can contain private record data; keep diagnostics to stderr, no tokens.
        raise RuntimeError(f'{args[0]} operation failed (exit {result.returncode}); verify permissions/account in gh')
    return result

def api(endpoint, method='GET', data=None, allow_missing=False):
    args = ['gh','api',endpoint,'--method',method]
    if data is not None: args += ['--input','-']
    r = run(args, stdin=json.dumps(data) if data is not None else None, check=False)
    if r.returncode:
        if allow_missing and ('HTTP 404' in r.stderr or 'Not Found (404)' in r.stderr): return None
        raise RuntimeError(f'GitHub {method} {endpoint} unavailable; verify access (exit {r.returncode})')
    return json.loads(r.stdout) if r.stdout.strip() else None

def pages(endpoint):
    # All metadata collections used here support standard page/per_page pagination.
    result=[]; page=1
    while True:
        rows=api(endpoint+('&' if '?' in endpoint else '?')+f'per_page=100&page={page}')
        result += rows
        if len(rows)<100:return result
        page+=1

def gql(query, **variables):
    r=api('graphql','POST',{'query':query,'variables':variables})
    if r.get('errors'): raise RuntimeError('GraphQL operation failed; inspect Projects permissions/schema with gh')
    return r['data']

def identify():
    user=api('user')
    if user['login'] != OWNER: raise RuntimeError('Wrong gh account; select saeed-alorm before running setup')
    return user

def audit():
    user=identify()
    print(json.dumps({'account':user['login'],'plan':(user.get('plan') or {}).get('name','unavailable')},indent=2))
    print('Repository inventory (review for authoritative mobile history):')
    for r in pages('user/repos?affiliation=owner,collaborator,organization_member'):
        if 'mawid' in r['name'].lower(): print(r['full_name'], 'private' if r['private'] else 'public', r['default_branch'])
    for endpoint in [f'repos/{WEB}/hooks', f'repos/{WEB}/branches/main/protection',f'repos/{WEB}/rulesets']:
        try:
            value=api(endpoint)
            if endpoint.endswith('/hooks'):
                print('Hooks:',json.dumps([{'id':h['id'],'name':h['name'],'active':h['active'],'destination_host':__import__('urllib.parse',fromlist=['urlparse']).urlparse(h.get('config',{}).get('url','')).hostname} for h in value]))
            else:print(endpoint, 'retrieved')
        except RuntimeError as exc:print(exc)
    print('Also inspect GitHub Settings > Applications > Authorized OAuth Apps / Installed GitHub Apps.')
    print('Remove only a verified Lovable-only authorization/webhook; do not revoke unrelated apps.')
    print('Inspect Settings > Billing and licensing > Usage and Budgets: retain included usage and a hard stop on paid Actions usage. This script does not change billing.')
    project_lookup(print_only=True)

def project_lookup(print_only=False):
    found=[];cursor=None
    while True:
        d=gql('query($login:String!,$after:String){user(login:$login){id projectsV2(first:100,after:$after){nodes{id number title url closed public} pageInfo{hasNextPage endCursor}}}}',login=OWNER,after=cursor)['user']
        found += [p for p in d['projectsV2']['nodes'] if p['title']==TITLE and not p['closed']]
        pi=d['projectsV2']['pageInfo']
        if not pi['hasNextPage']:break
        cursor=pi['endCursor']
    if len(found)>1: raise RuntimeError('Multiple active MAWID Engineering Projects; select/merge the authoritative Project before rerunning')
    if print_only:
        print('Engineering Project:',found[0]['url'] if found else 'not found');return
    return d['id'],found[0] if found else None

def metadata():
    identify()
    items=json.loads((ROOT/'docs/engineering/issues.json').read_text())
    # Private repository may be unavailable: web metadata still completes.
    repos=[WEB]
    try:
        mobile=api(f'repos/{MOBILE}',allow_missing=True)
    except RuntimeError:
        mobile=None
        print('PENDING mobile metadata: private repository access is unavailable; continuing web setup')
    if mobile:
        if not mobile['private']: raise RuntimeError('Refusing mobile source/tracking in a public repository')
        repos.append(MOBILE)
    else:print('PENDING mobile issue/metadata: private source repository has not been imported')
    existing={};milestones={}
    colors={'type:task':'1d76db','type:decision':'5319e7','type:epic':'7057ff','type:bug':'d73a4a','priority:critical':'b60205','priority:high':'d93f0b','priority:normal':'fbca04'}
    colors.update({f'phase:P{i}':'0e8a16' for i in range(6)})
    for repo in repos:
        labels={x['name'] for x in pages(f'repos/{repo}/labels')}
        for name,color in colors.items():
            if name not in labels:api(f'repos/{repo}/labels','POST',{'name':name,'color':color,'description':'Engineering '+name.replace(':',': ')})
        ms=pages(f'repos/{repo}/milestones?state=all')
        for phase in [f'P{i}' for i in range(6)]:
            matches=[m for m in ms if m['title']==phase]
            if len(matches)>1:raise RuntimeError('Duplicate phase milestones; reconcile before proceeding')
            m=matches[0] if matches else api(f'repos/{repo}/milestones','POST',{'title':phase,'description':f'{phase} phase gate; no committed due date'})
            milestones[repo,phase]=m['number']
        existing[repo]=[i for i in pages(f'repos/{repo}/issues?state=all') if 'pull_request' not in i]
    urls={}
    for x in items:
        repo=x['repository']
        if repo not in repos:continue
        marker=f"<!-- maw-id:{x['key']} -->"
        matches=[i for i in existing[repo] if marker in (i.get('body') or '') or i['title']==x['title']]
        if len(matches)>1:raise RuntimeError(f"Duplicate issues for {x['key']}; reconcile before rerun")
        desired=[f"type:{x['type']}",f"priority:{x['priority']}",f"phase:{x['phase']}"]
        if matches:
            i=matches[0]
            labels=sorted(set(desired+[l['name'] for l in i['labels']]))
            # Only reconcile metadata; preserve edited acceptance and discussions.
            api(f"repos/{repo}/issues/{i['number']}",'PATCH',{'labels':labels,'milestone':milestones[repo,x['phase']]})
        else:
            payload={'title':x['title'],'body':x['body'],'labels':desired,'milestone':milestones[repo,x['phase']]}
            eligible=run(['gh','api',f'repos/{repo}/assignees/{OWNER}'],check=False)
            if eligible.returncode==0:payload['assignees']=[OWNER]
            i=api(f'repos/{repo}/issues','POST',payload)
        urls[x['key']]=i
        print(x['key'],i['html_url'])
    # Add resolved dependency links without replacing any existing issue content.
    for x in items:
        if x['key'] not in urls:continue
        i=urls[x['key']];links=[f"- [{k}]({urls[k]['html_url']})" for k in x['dependencies'] if k in urls]
        if not links:continue
        current=api(f"repos/{x['repository']}/issues/{i['number']}")['body'] or ''
        if all(urls[k]['html_url'] in current for k in x['dependencies'] if k in urls):continue
        addition='\n\n<!-- resolved-dependencies -->\n## Resolved engineering dependency links\n'+'\n'.join(links)
        api(f"repos/{x['repository']}/issues/{i['number']}",'PATCH',{'body':current+addition})
    owner_id,project=project_lookup()
    created=False
    if project is None:
        project=gql('mutation($owner:ID!,$title:String!){createProjectV2(input:{ownerId:$owner,title:$title}){projectV2{id number title url public}}}',owner=owner_id,title=TITLE)['createProjectV2']['projectV2'];created=True
    if project.get('public') and MOBILE in repos:
        raise RuntimeError('Engineering Project is public; review/make private before adding private mobile metadata')
    fields=gql('query($id:ID!){node(id:$id){... on ProjectV2{fields(first:100){nodes{... on ProjectV2SingleSelectField{id name options{id name color description}}}}}}}',id=project['id'])['node']['fields']['nodes']
    status=next(f for f in fields if f.get('name')=='Status')
    names=[o['name'] for o in status['options']]
    if names!=STATUSES:
        # Do not remap live statuses or destroy existing Project configuration.
        if not created:raise RuntimeError(f"Existing Project {project['url']} has other Status options; reconcile to {STATUSES} without losing item states, then rerun")
        options=[{'name':s,'color':c,'description':d} for s,c,d in zip(STATUSES,['GRAY','BLUE','YELLOW','ORANGE','PURPLE','GREEN'],['Not yet implementation ready','Dependencies/decisions allow work','Active branch work','PR checks and review','Merged; target build verification pending','Acceptance and release evidence complete'])]
        status=gql('mutation($id:ID!,$opts:[ProjectV2SingleSelectFieldOptionInput!]!){updateProjectV2Field(input:{fieldId:$id,singleSelectOptions:$opts}){projectV2Field{... on ProjectV2SingleSelectField{id name options{id name}}}}}',id=status['id'],opts=options)['updateProjectV2Field']['projectV2Field']
    backlog=next(o['id'] for o in status['options'] if o['name']=='Backlog')
    known=set();cursor=None
    while True:
        page=gql('query($id:ID!,$after:String){node(id:$id){... on ProjectV2{items(first:100,after:$after){nodes{id content{... on Issue{id}}} pageInfo{hasNextPage endCursor}}}}}',id=project['id'],after=cursor)['node']['items']
        known.update(n['content']['id'] for n in page['nodes'] if n.get('content'))
        if not page['pageInfo']['hasNextPage']:break
        cursor=page['pageInfo']['endCursor']
    for repo in repos:
        r=api(f'repos/{repo}')
        gql('mutation($p:ID!,$r:ID!){linkProjectV2ToRepository(input:{projectId:$p,repositoryId:$r}){repository{id}}}',p=project['id'],r=r['node_id'])
    for i in urls.values():
        if i['node_id'] in known:continue # preserve authoritative existing status
        item=gql('mutation($p:ID!,$i:ID!){addProjectV2ItemById(input:{projectId:$p,contentId:$i}){item{id}}}',p=project['id'],i=i['node_id'])['addProjectV2ItemById']['item']
        gql('mutation($p:ID!,$i:ID!,$f:ID!,$s:String!){updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$s}}){projectV2Item{id}}}',p=project['id'],i=item['id'],f=status['id'],s=backlog)
    print('Project:',project['url'])
    print('All new work starts Backlog. Move only after decisions/dependencies allow; no status labels were created.')

def protect(sha):
    user=identify()
    for repo,check in [(WEB,'web-checks'),(MOBILE,'mobile-checks')]:
        r=api(f'repos/{repo}',allow_missing=True)
        if not r:continue
        if r['private'] and (user.get('plan') or {}).get('name') not in ['pro','business','enterprise']:
            print('PENDING private protection: verify supported plan; maintain manual PR/check discipline',repo);continue
        ref=sha if repo==WEB else r['default_branch']
        checks=api(f'repos/{repo}/commits/{ref}/check-runs')['check_runs']
        if not any(c['name']==check and c['conclusion']=='success' for c in checks):
            print('PENDING protection: required check has not actually succeeded',repo,check);continue
        current=api(f"repos/{repo}/branches/{r['default_branch']}/protection",allow_missing=True)
        if current:
            contexts=current.get('required_status_checks') or {}
            names=set(contexts.get('contexts',[])) | {c['context'] for c in contexts.get('checks',[])}
            if check in names and current.get('required_pull_request_reviews') is not None:
                print('Existing PR/check control retained',repo);continue
            raise RuntimeError('Existing branch protection needs a reviewed additive update; refusing to overwrite unrelated controls')
        api(f"repos/{repo}/branches/{r['default_branch']}/protection",'PUT',{
          'required_status_checks':{'strict':True,'contexts':[check]},'enforce_admins':False,
          'required_pull_request_reviews':{'dismiss_stale_reviews':True,'require_code_owner_reviews':False,'required_approving_review_count':0},
          'restrictions':None,'required_conversation_resolution':True,'allow_force_pushes':False,'allow_deletions':False})
        print('Configured PR/check protection with zero mandatory independent approvals; admin recovery retained',repo)

def mobile_import(bundle):
    identify();bundle=Path(bundle).resolve()
    if not bundle.is_file():raise RuntimeError('Private reviewed Git bundle is required before repository creation')
    run(['git','bundle','list-heads',str(bundle)])
    existing=api(f'repos/{MOBILE}',allow_missing=True)
    if existing and not existing['private']:raise RuntimeError('Existing mobile repository is public; do not import private source or change visibility here')
    if existing:
        refs=run(['git','ls-remote',f'https://github.com/{MOBILE}.git'],check=False)
        # Reuse history rather than importing over an existing authoritative repository.
        if refs.returncode:raise RuntimeError('Cannot inspect existing mobile refs')
        allowed='refs/heads/codex/github-readiness-2026-11-07'
        if refs.stdout.strip() and allowed not in refs.stdout:raise RuntimeError('Existing mobile history found; reconcile authoritative source before snapshot import')
    else:
        api('user/repos','POST',{'name':'mawid-mobile','private':True,'description':'Private MAWID Android engineering source; fictional demo, not production','auto_init':False})
    temp=ROOT.parent/'mawid-mobile-import'
    if not (temp/'.git').exists():run(['git','clone','--branch','main',str(bundle),str(temp)])
    # Remote visibility was checked before any source push. Never force push.
    remotes=run(['git','remote'],cwd=temp).stdout.split()
    if 'github' not in remotes:run(['git','remote','add','github',f'https://github.com/{MOBILE}.git'],cwd=temp)
    run(['git','push','github','refs/heads/main:refs/heads/main','refs/remotes/origin/codex/github-readiness-2026-11-07:refs/heads/codex/github-readiness-2026-11-07'],cwd=temp)
    api(f'repos/{MOBILE}','PATCH',{'default_branch':'main'})
    prs=pages(f'repos/{MOBILE}/pulls?state=open')
    match=next((p for p in prs if p['head']['ref']=='codex/github-readiness-2026-11-07'),None)
    if not match:
        match=api(f'repos/{MOBILE}/pulls','POST',{'title':'Import private Android demo and reproducible engineering setup','head':'codex/github-readiness-2026-11-07','base':'main','body':'Imports the supplied source snapshot with provenance, Linux setup, tests and gated private CI. Full private web source provenance remains unresolved. No production/store release. Review docs/github-readiness.md and test evidence before merging.'})
    print('Private import PR:',match['html_url'])
    print('CI remains gated until included allowance and hard-stop billing settings are verified. No source onboarding is complete until merge and checks pass.')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['audit','metadata','protect','mobile-import'])
    parser.add_argument('--sha',help='Exact reviewed web PR commit with successful actual web-checks')
    parser.add_argument('--bundle',help='Private mobile Git bundle; never commit it in the public web repo')
    args=parser.parse_args()
    try:
        if args.action=='audit':audit()
        elif args.action=='metadata':metadata()
        elif args.action=='protect':
            if not args.sha or len(args.sha)!=40:raise RuntimeError('Pass --sha with exact checked web PR commit')
            protect(args.sha)
        else:
            if not args.bundle:raise RuntimeError('Pass --bundle with private reviewed source bundle')
            mobile_import(args.bundle)
    except (RuntimeError, FileNotFoundError) as exc:
        print('INCOMPLETE:',exc,file=sys.stderr);sys.exit(1)
