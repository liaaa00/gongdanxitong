import { MigrationInterface, QueryRunner } from 'typeorm';

const CONTRACT_SUBJECTS = [
  {"province":"浙江","city":"宁波","name":"外服（浙江）企业服务有限公司","creditCode":"91330206MAEM8K1J2T","address":"浙江省宁波市北仑区梅山街道梅山七星路88号1幢501室B366"},
  {"province":"北京","city":"北京","name":"外服（浙江）企业服务有限公司北京分公司","creditCode":"91110105MAENTDM58T","address":"北京市朝阳区东三环中路7号（3.4号楼）3号楼4层0509"},
  {"province":"四川","city":"成都","name":"外服（浙江）企业服务有限公司成都分公司","creditCode":"91510105MAEPKQTR0R","address":"成都市青羊区清江中路20号（中国成都人力资源服务产业园）17层5号"},
  {"province":"上海","city":"上海","name":"外服（浙江）企业服务有限公司上海分公司","creditCode":"91310101MAEQEP1150","address":"上海市黄浦区金陵西路28号1号楼1201室"},
  {"province":"重庆","city":"重庆","name":"外服（浙江）企业服务有限公司重庆分公司","creditCode":"91500103MAER6MW974","address":"重庆市渝中区解放碑街道民权路28号38层5-1"},
  {"province":"浙江","city":"杭州","name":"外服（浙江）企业服务有限公司杭州分公司","creditCode":"91330106MAEN753A6T","address":"浙江省杭州市西湖区灵隐街道杭大路15号嘉华国际商务中心地上7层805-1室"},
  {"province":"浙江","city":"杭州西湖区","name":"外服（浙江）企业服务有限公司杭州西湖区分公司","creditCode":"91330106MAEQ5PGA59","address":"浙江省杭州市西湖区灵隐街道杭大路15号嘉华国际商务中心地上7层803-1室"},
  {"province":"湖北","city":"武汉","name":"外服（浙江）企业服务有限公司武汉分公司","creditCode":"91420103MAEQY72X3C","address":"湖北省武汉市江汉区淮海路269号泛海国际SOHO城3号楼1803-1807室-1"},
  {"province":"河南","city":"郑州","name":"外服（浙江）企业服务有限公司郑州分公司","creditCode":"91410100MAETJ59F69","address":"河南自贸试验区郑州片区（郑东）CBD商务外环2号河南传媒大厦809、810室"},
  {"province":"陕西","city":"西安","name":"外服（浙江）企业服务有限公司西安分公司","creditCode":"91610103MAETE9Q218","address":"陕西省西安市碑林区长安北路14号（朱雀广场北部二层）"},
  {"province":"河北","city":"石家庄","name":"外服（浙江）企业服务有限公司石家庄分公司","creditCode":"91130101MAETT36R4E","address":"河北省石家庄市高新区长江街道中山东路961号2号楼一楼G1277"},
  {"province":"湖南","city":"长沙","name":"外服（浙江）企业服务有限公司长沙分公司","creditCode":"91430103MAEWAYFJX5","address":"湖南省长沙市天心区南托街道创业路159号长沙宝成建材有限公司1栋高层建材加工厂房1001-27"},
  {"province":"江西","city":"南昌","name":"外服（浙江）企业服务有限公司南昌分公司","creditCode":"91360102MAER321X5M","address":"江西省南昌市东湖区阳明东路66号央央春天1号楼投资大厦2702室"},
  {"province":"云南","city":"昆明","name":"外服（浙江）企业服务有限公司昆明分公司","creditCode":"91530103MAEU7K3P6C","address":"云南省昆明市盘龙区东风东路-东风路1号勘泰大厦1606室"},
  {"province":"黑龙江","city":"哈尔滨","name":"外服（浙江）企业服务有限公司哈尔滨分公司","creditCode":"91230103MAEW3PUR89","address":"黑龙江省哈尔滨市南岗区红军街15号奥威斯发展大厦第27层GH座"},
  {"province":"广东","city":"广州","name":"外服（浙江）企业服务有限公司广州分公司","creditCode":"91440104MAEWCWHD91","address":"广州市越秀区瑶华中街228号203房之十一K3"},
  {"province":"辽宁","city":"大连","name":"外服（浙江）企业服务有限公司大连分公司","creditCode":"91210202MAEW6A1C6R","address":"辽宁省大连市中山区人民路26号中国人寿大厦17层01号"},
  {"province":"山西","city":"太原","name":"外服（浙江）企业服务有限公司太原分公司","creditCode":"91140105MAEX9CCB0Q","address":"山西省太原市小店区西温庄乡西攒村西街2号浩海二期物流园3层8号"},
  {"province":"广东","city":"深圳","name":"外服（浙江）企业服务有限公司深圳分公司","creditCode":"91440300MAEWGWN61W","address":"深圳市南山区粤海街道科技园社区科发路2号30区3栋（文峥鑫大厦）二楼2F71"},
  {"province":"山东","city":"青岛","name":"外服（浙江）企业服务有限公司青岛分公司","creditCode":"91370203MAG0RY4Q4N","address":"山东省青岛市市北区台柳路179号1218户"},
  {"province":"辽宁","city":"沈阳","name":"外服（浙江）企业服务有限公司沈阳分公司","creditCode":"91210102MAEWXWA37M","address":"辽宁省沈阳市和平区南京北街272号北约客置地广场45层01-07、13号—035号"},
  {"province":"山东","city":"济南","name":"外服（浙江）企业服务有限公司济南分公司","creditCode":"91370100MAEXGBMC86","address":"山东省济南市高新区舜华路街道新泺大街1666号齐盛广场6号办公楼917"},
  {"province":"福建","city":"福州","name":"外服（浙江）企业服务有限公司福州分公司","creditCode":"91350102MAEWX2F02T","address":"福建省福州市鼓楼区东街街道东泰路124号碧玉花园5#楼连接体三层房D-21室"},
  {"province":"天津","city":"天津","name":"外服（浙江）企业服务有限公司天津分公司","creditCode":"91120101MA82METN4E","address":"天津市和平区五大道街道郑州道18号港澳大厦1001室"},
  {"province":"福建","city":"厦门","name":"外服（浙江）企业服务有限公司厦门分公司","creditCode":"91350203MAG1X020XG","address":"厦门市思明区大元路33号222室R单元"},
  {"province":"湖北","city":"襄阳","name":"外服（浙江）企业服务有限公司襄阳分公司","creditCode":"91420607MAK2TA3G0U","address":"湖北省襄阳高新技术开发区紫贞街道园林社区中原西路8号襄阳人力资源服务产业园第6层638号"},
  {"province":"山西","city":"运城","name":"外服（浙江）企业服务有限公司运城分公司","creditCode":"91140802MAK1UQKG7W","address":"山西省运城市盐湖区工农西街64号国贸大酒店414室"},
  {"province":"山西","city":"长治","name":"外服（浙江）企业服务有限公司长治分公司","creditCode":"91140491MAK2TX345N","address":"山西省长治市长治高新技术产业开发区城西北路34号（西北商城）11层1140室"},
  {"province":"江苏","city":"泰州","name":"外服（浙江）企业服务有限公司泰州分公司","creditCode":"91321202MAK29DU351","address":"江苏省泰州市海陵区人民东路51号201室2A01"},
  {"province":"江苏","city":"苏州","name":"外服（浙江）企业服务有限公司苏州分公司","creditCode":"91320508MAK6F3QH3J","address":"江苏省苏州市姑苏区虎丘路388号1号楼3569室"},
  {"province":"安徽","city":"合肥","name":"外服（浙江）企业服务有限公司合肥分公司","creditCode":"91340103MAK6FXXW2E","address":"安徽省合肥市庐阳区逍遥津街道长江中路146号徽盐安徽中心26层2610、2611房间"},
  {"province":"贵州","city":"贵阳","name":"外服（浙江）企业服务有限公司贵阳分公司","creditCode":"91520115MAKAJH7A91","address":"贵州省贵阳市观山湖区世纪城街道金阳南路与兴筑路交叉口处电商发展中心（一）层（20-12）号"},
  {"province":"江苏","city":"无锡","name":"外服（浙江）企业服务有限公司无锡分公司","creditCode":"91320213MAK750HT28","address":"无锡市梁溪区振奋路303号二楼220"},
  {"province":"江苏","city":"南通","name":"外服（浙江）企业服务有限公司南通分公司","creditCode":"91320691MAK668409U","address":"江苏省南通市开发区中兴街道广州路42号435室"},
  {"province":"江苏","city":"昆山","name":"外服（浙江）企业服务有限公司昆山分公司","creditCode":"91320583MAK4C7NC6F","address":"昆山开发区百富路88号16号楼505室"},
  {"province":"江苏","city":"苏州工业园区","name":"外服（浙江）企业服务有限公司苏州工业园区分公司","creditCode":"91320594MAK7ATQQ17","address":"苏州工业园区和顺路28号1号楼627室"},
  {"province":"上海","city":"上海黄浦区","name":"外服（浙江）企业服务有限公司上海黄浦区分公司","creditCode":"91310101MAK9940Q47","address":"上海市黄浦区丽园路700号5楼501室Q-357单元"},
  {"province":"广西","city":"南宁","name":"外服（浙江）企业服务有限公司南宁分公司","creditCode":"91450102MAK7AFWB90","address":"南宁市兴宁区朝阳路66号钻石广场16层A10号“商务秘书企业（广西程溯商务秘书服务有限公司）托管”"},
  {"province":"吉林","city":"长春","name":"外服（浙江）企业服务有限公司长春分公司","creditCode":"91220103MAK6HWRL2Q","address":"长春市宽城区基隆北街东三合屯棚户区改造工程28号楼302号"},
  {"province":"江苏","city":"南京","name":"外服（浙江）企业服务有限公司南京分公司","creditCode":"91320104MAK9M3J943","address":"江苏省南京市秦淮区苜蓿园大街29-1号紫金城21幢106室S2690"},
  {"province":"海南","city":"海口","name":"外服（浙江）企业服务有限公司海口分公司","creditCode":"91460000MAKBUNU19J","address":"海南省海口市龙华区滨海街道滨海大道32号复兴城A1区A1058B-2房-2004-188号"},
  {"province":"吉林","city":"吉林","name":"外服(浙江)企业服务有限公司吉林分公司","creditCode":"91220211MAKKCX9049","address":"吉林市丰满区松江南路1123号丰满区高科技创新创业孵化园区2号楼206-2A23室"},
  {"province":"江苏","city":"太仓","name":"外服（浙江）企业服务有限公司太仓分公司","creditCode":"91320585MAK964AD5Y","address":"江苏省苏州市太仓市城厢镇城西北路8号23幢404室"},
  {"province":"广东","city":"佛山","name":"外服（浙江）企业服务有限公司佛山分公司","creditCode":"91440604MAKHR1EQ0D","address":"广东省佛山市禅城区石湾镇街道潘一村华艺北区之一10座四层15-23号A0211房"},
  {"province":"新疆","city":"乌鲁木齐","name":"外服（浙江）企业服务有限公司乌鲁木齐分公司","creditCode":"91650104MAKDF14991","address":"新疆乌鲁木齐高新区（新市区）长春中路街道天津北路320号天河广场13.16.17层A0057"},
  {"province":"内蒙古","city":"呼和浩特","name":"外服（浙江）企业服务有限公司呼和浩特分公司","creditCode":"91150102MAKDLQG29C","address":"内蒙古自治区呼和浩特市新城区车站前街水岸小镇F区呼和浩特数字经济产业园A座202-34号房间"},
  {"province":"甘肃","city":"兰州","name":"外服（浙江）企业服务有限公司兰州分公司","creditCode":"91620102MAKDE7X35N","address":"甘肃省兰州市城关区盐场路街道忠和村189号2层205号办公室"},
  {"province":"安徽","city":"安庆","name":"外服（浙江）企业服务有限公司安庆分公司","creditCode":"91340800MAKA9QQ163","address":"安徽省安庆市经济技术开发区菱北街道舒怡国际家居购物广场一期四层D8003商铺59号"},
  {"province":"江苏","city":"徐州","name":"外服（浙江）企业服务有限公司徐州分公司","creditCode":"91320303MAKBHGHWXE","address":"江苏省徐州市云龙区汉景大道38号和平壹号二期22号楼2楼230"},
  {"province":"江苏","city":"扬州","name":"外服（浙江）企业服务有限公司扬州分公司","creditCode":"91321002MAKAQUGB8P","address":"扬州市广陵区沙头镇创业路9号C3幢216-2"},
  {"province":"江苏","city":"盐城","name":"外服（浙江）企业服务有限公司盐城分公司","creditCode":"91320903MAK9A6E28W","address":"江苏省盐城市盐都区大冈镇呈祥西路93-2号"},
  {"province":"江苏","city":"镇江","name":"外服（浙江）企业服务有限公司镇江分公司","creditCode":"91321192MAK9JH925L","address":"江苏省镇江高新区国际工业品城F01幢508室"},
  {"province":"江苏","city":"宿迁","name":"外服（浙江）企业服务有限公司宿迁分公司","creditCode":"91321311MAKB3L6H4N","address":"宿迁高新技术产业开发区新材料科技城A9栋308-1室"},
  {"province":"江苏","city":"常州","name":"外服（浙江）企业服务有限公司常州分公司","creditCode":"91320485MAK9C3E8XW","address":"江苏省常州市经济开发区横山桥新利贸业广场7幢2室A29室"},
  {"province":"江苏","city":"连云港","name":"外服（浙江）企业服务有限公司连云港分公司","creditCode":"91320706MAKAEH9N0E","address":"江苏省连云港市海州区朝阳东路32-6号东盛阳光大厦413号"},
  {"province":"江苏","city":"淮安","name":"外服（浙江）企业服务有限公司淮安分公司","creditCode":"91320891MAK8ENKFX1","address":"江苏省淮安经济技术开发区解放东路111号51幢D51-13室"},
  {"province":"安徽","city":"阜阳","name":"外服（浙江）企业服务有限公司阜阳分公司","creditCode":"91341204MAKAR30K19","address":"安徽省阜阳市颍泉区周棚街道涡阳北路1177号阜阳临沂商城C8#商业楼108室"},
  {"province":"安徽","city":"淮南","name":"外服（浙江）企业服务有限公司淮南分公司","creditCode":"91340403MAKB01GG9U","address":"安徽省淮南市田家庵区舜耕镇淮舜南路爱佳综合楼601-4号"},
  {"province":"安徽","city":"黄山","name":"外服（浙江）企业服务有限公司黄山分公司","creditCode":"91341002MAK94PDUX6","address":"安徽省黄山市屯溪区屯光镇泉源坞路1号一楼107室"},
  {"province":"安徽","city":"芜湖","name":"外服（浙江）企业服务有限公司芜湖分公司","creditCode":"91340207MAKAKCG81A","address":"安徽省芜湖市镜湖区荆山街道绿地新都会G栋1121室"},
  {"province":"安徽","city":"宿州","name":"外服（浙江）企业服务有限公司宿州分公司","creditCode":"91341392MAKB3APJ19","address":"安徽省宿州市宿马现代产业园区东部新城科创大厦2号楼9楼917-3室"},
  {"province":"安徽","city":"蚌埠","name":"外服（浙江）企业服务有限公司蚌埠分公司","creditCode":"91340304MAKDA58C2D","address":"安徽省蚌埠市禹会区钓鱼台街道荣盛·锦绣香堤小区三期1号楼7层16号"},
  {"province":"安徽","city":"铜陵","name":"外服（浙江）企业服务有限公司铜陵分公司","creditCode":"91340705MAKCNXJK4E","address":"安徽省铜陵市铜官区西湖镇西湖大道1958号1栋101号"},
  {"province":"北京","city":"北京","name":"外服（浙江）企业服务有限公司北京市东城区分公司","creditCode":"91110101MAKC73UW35","address":"北京市东城区灯市口大街33号3层308B-184"},
  {"province":"辽宁","city":"丹东","name":"外服（浙江）企业服务有限公司丹东分公司","creditCode":"91210602MAKFG8GK1P","address":"辽宁省丹东市元宝区金海商业城A座二楼263-2"},
  {"province":"辽宁","city":"鞍山","name":"外服（浙江）企业服务有限公司鞍山分公司","creditCode":"91210302MAKGR7AG9W","address":"辽宁省鞍山市铁东区解放东路47\n910栋1层S12号"},
  {"province":"辽宁","city":"锦州","name":"外服（浙江）企业服务有限公司锦州分公司","creditCode":"91210703MAKGRU7NXK","address":"辽宁省锦州市凌河区兰花里12号A06-1云耕九州数字文旅红色微短剧产业基地开放办公区82号"},
  {"province":"辽宁","city":"营口","name":"外服（浙江）企业服务有限公司营口分公司","creditCode":"91210802MAKGMP6N25","address":"辽宁省营口市站前区渤海大街西12-648号"},
  {"province":"山东","city":"泰安","name":"外服（浙江）企业服务有限公司泰安分公司","creditCode":"91370902MAKFJ0GH1A","address":"山东省泰安市泰山区财源街道望岳西路以西、天平街以南泰山国际金融中心商业写字楼1505户"},
  {"province":"山东","city":"济南","name":"外服（浙江）企业服务有限公司济南历下区分公司","creditCode":"91370102MAKEA7AW5Q","address":"山东省济南市历下区泉城路180号齐鲁国际大厦五层C区533室"},
  {"province":"湖南","city":"浏阳","name":"外服（浙江）企业服务有限公司浏阳分公司","creditCode":"91430181MAKK1MWN95","address":"浏阳市关口街道锦程大道香槟现代城A栋1518室"},
  {"province":"安徽","city":"合肥","name":"外服（浙江）企业服务有限公司合肥庐阳区分公司","creditCode":"91340103MAKHFTWP8W","address":"安徽省合肥市庐阳区大杨镇清源路760号名门湖畔小区办公楼402"},
  {"province":"辽宁","city":"盘锦","name":"外服（浙江）企业服务有限公司盘锦分公司","creditCode":"91211103MAKHG4KT19","address":"辽宁省盘锦市兴隆台区兴海街道中华路东、兴油街南、油英南路西、兴隆台街北211103005007GB00001W00000000双创大厦A座1010-1室"},
  {"province":"吉林","city":"白山","name":"外服（浙江）企业服务有限公司白山分公司","creditCode":"91220600MAKKD79X96","address":"白山市浑江区南平街长白山国际商业批发中心D区000122"},
  {"province":"吉林","city":"白城","name":"外服（浙江）企业服务有限公司白城分公司","creditCode":"91220800MAKJY1AB2K","address":"白城市光明南街20号楼北侧东数第6户"}
] as const;

export class CreateContractSubjects20260806001000 implements MigrationInterface {
  name = 'CreateContractSubjects20260806001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("UPDATE field_configs SET field_name = '劳动合同主体注册地', help_text = '由劳动合同主体自动带出；电子签平台为E签宝时必填。' WHERE field_code = 'company_address'");
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contract_subjects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        subject_name varchar(256) NOT NULL,
        social_credit_code varchar(32),
        province varchar(32) NOT NULL,
        city varchar(64) NOT NULL,
        registered_address text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_subjects_social_credit_code ON contract_subjects (social_credit_code) WHERE social_credit_code IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_contract_subjects_active_name ON contract_subjects (is_active, subject_name)`);
    for (const subject of CONTRACT_SUBJECTS) {
      await queryRunner.query(`
        INSERT INTO contract_subjects (subject_name, social_credit_code, province, city, registered_address, is_active)
        VALUES ($1, $2, $3, $4, $5, true)
        ON CONFLICT (social_credit_code) WHERE social_credit_code IS NOT NULL DO UPDATE SET
          subject_name = EXCLUDED.subject_name,
          province = EXCLUDED.province,
          city = EXCLUDED.city,
          registered_address = EXCLUDED.registered_address,
          is_active = true,
          updated_at = now()
      `, [subject.name, subject.creditCode, subject.province, subject.city, subject.address]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("UPDATE field_configs SET field_name = '甲方住所', help_text = '电子签平台为速创时非必填；电子签平台为E签宝时必填。' WHERE field_code = 'company_address'");
    await queryRunner.query('DROP TABLE IF EXISTS contract_subjects');
  }
}
