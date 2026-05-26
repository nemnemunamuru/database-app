import numpy as np
import matplotlib.pyplot as plt

def distribution(data, d_stp, i_stp, d_st, d_en, i_st, i_en):
    d_range = np.arange(d_st, d_en+d_stp, d_stp)
    i_range = np.arange(i_st, i_en+i_stp, i_stp)

    #x軸分割数
    i_num = int((i_en-i_st)/i_stp)
    #y軸分割数
    d_num = int((d_en-d_st)/d_stp)

    dist = np.zeros((d_num,i_num), dtype='int')    

    num = 0
    i = 0
    for i in range (len(data[:,0])):
        j = 0
        for j in range(len(d_range)-1):
            k = 0
            for k in range(len(i_range)-1):
                if data[i,2] >= d_range[j] and data[i,2] < d_range[j+1]:
                    if data[i,3] >= i_range[k] and data[i,3] < i_range[k+1]:
                        dist[j,k] = dist[j,k]+1
                        num = num+1
    
    pf_percent = dist/num*100
    print(num)
    if g.isEnableGraph == 1:
        pf_plot(i_num, i_stp, i_st, d_num, d_stp, d_st, pf_percent, g.fileName)

    return pf_percent

def distributionEx(data, d_stp, i_stp, d_st, d_en, i_st, i_en):
    d_range = np.arange(d_st, d_en + d_stp, d_stp)
    i_range = np.arange(i_st, i_en + i_stp, i_stp)

    # x軸分割数
    i_num = int((i_en - i_st) / i_stp)
    # y軸分割数
    d_num = int((d_en - d_st) / d_stp)

    dist = np.zeros((d_num, i_num), dtype='int')

    # 各データポイントのd_rangeとi_rangeのインデックスを計算
    d_indices = np.digitize(data[:, 2], d_range) - 1
    i_indices = np.digitize(data[:, 3], i_range) - 1

    # 範囲外のインデックスを除外
    valid_mask = (d_indices >= 0) & (d_indices < d_num) & (i_indices >= 0) & (i_indices < i_num)
    d_indices = d_indices[valid_mask]
    i_indices = i_indices[valid_mask]

    # 各インデックスのカウントを計算
    np.add.at(dist, (d_indices, i_indices), 1)

    num = np.sum(dist)
    pf_percent = dist / num * 100

    print(num)
    if g.isEnableGraph == 1:
        pf_plot(i_num, i_stp, i_st, d_num, d_stp, d_st, pf_percent, g.fileName)

    return pf_percent



def percent_max(pf):
    pf_percent_max = np.max(pf)
    return pf_percent_max




def pf_plot(i_num,i_stp,i_st,d_num,d_stp,d_st,dist,filename):
    xstick1 = np.arange(0,i_num,i_num/10)
    xstick2 = xstick1*i_stp+i_st

    ystick1 = np.arange(0,d_num,d_num/10)
    ystick2 = np.round(ystick1*d_stp+d_st,2)

    fig, ax = plt.subplots(figsize=(8,8))

    ax.invert_yaxis()
    ax.xaxis.tick_top()

    im = ax.imshow(dist, aspect='auto', cmap='gnuplot2')
    # im = ax.imshow(dist, aspect='auto', cmap='inferno', vmin=0, vmax=2)
    fig.colorbar(im, ax=ax)

    plt.xticks(xstick1,xstick2)
    plt.yticks(ystick1,ystick2)

    plt.xlabel('intensity [db]')
    plt.ylabel('Depth [mm]')
    plt.title(filename)

    #plt.show()
    plt.savefig(g.ImgPath+filename+"_pf.png")
    plt.close()